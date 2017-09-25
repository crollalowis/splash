/* globals Craft */
import "./polyfills";
import { debounce, t, inViewport } from "./helpers";

const slowLoading = [
	"Any second now...",
	"Almost there...",
	"Just a moment...",
	"Nearly got it...",
	"Still searching for {query}...",
	"So... {query}, huh?",
	"{query} images coming right up...",
];

class Splash { // eslint-disable-line no-unused-vars
	
	// Variables
	// =========================================================================
	
	grid = null;
	form = null;
	
	io = null;
	xhr = null;
	
	page = 1;
	search = "";
	totalPages = 1;
	isQuerying = false;
	
	shortest = [];
	watchers = [];
	
	// Splash
	// =========================================================================
	
	constructor () {
		this.grid = document.getElementById("splashGrid");
		this.form = document.getElementById("splashSearch");
		
		this.io = new IntersectionObserver(this.onObserve);
		this.io.observe(document.getElementById("splashMore"));
		
		this.form.addEventListener("submit", e => e.preventDefault());
		this.form.firstElementChild.addEventListener(
			"input",
			debounce(this.onSearch, 700)
		);
		
		this.query(true);
	}
	
	// Actions
	// =========================================================================
	
	query (isNewSearch = false, isRetry = false) {
		if (isNewSearch) {
			this.page = 1;
			this.totalPages = 1;
			this.grid.classList.add("searching");
		} else if (!isRetry) this.page++;
		
		if (this.page > this.totalPages) return;
		
		this.isQuerying = true;
		
		this.xhr && this.xhr.cancel();
		
		this.xhr = new XMLHttpRequest();
		this.xhr.open("POST", Craft.getActionUrl("splash/un"), true);
		this.xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
		this.xhr.onload = () => {
			const status = this.xhr.status;
			let res = this.xhr.responseText;
			this.xhr = null;
			
			isNewSearch && this.grid.classList.remove("searching");
			this.isQuerying = false;
			
			if (status < 200 || status >= 400) {
				Craft.cp.displayError(res);
				return;
			}
			
			res = JSON.parse(res);
			
			// In case the Unsplash API decides to nope out
			if (res.images === null) {
				this.grid.dataset.loading = isRetry ? (
					slowLoading[Math.floor(Math.random() * slowLoading.length)]
						.replace("{query}", this.search)
				) : "Unsplash is taking a while...";
				this.query(isNewSearch, true);
				return;
			}
			
			this.totalPages = res.totalPages;
			this.populateResults(res.images);
		};
		
		const data = new FormData();
		data.append(Craft.csrfTokenName, Craft.csrfTokenValue);
		data.append("page", this.page);
		data.append("query", encodeURI(this.search.trim()));
		
		this.xhr.send(data);
	}
	
	populateResults (results) {
		if (this.page === 1) {
			this.clearResults();
			this.resetShortest();
		}
		
		results.forEach(result => {
			let height = 75;
			
			if (result.width && result.height) {
				height = (result.height / result.width) * 100;
			}
			
			const si = this.shortest.indexOf(Math.min(...this.shortest));
			this.shortest[si] += height;
			
			this.grid.children[si].insertBefore(
				this.render(result),
				this.grid.children[si].lastElementChild
			);
		});
		
		this.watchers.forEach(watcher => this.loadNextImage(watcher));
		
		if (this.page === this.totalPages)
			for (let i = 0; i < this.grid.children.length; i++)
				this.grid.children[i].removeChild(
					this.grid.children[i].lastElementChild
				);
	}
	
	// Events
	// =========================================================================
	
	onSearch = e => {
		this.search = e.target.value;
		this.query(true);
	};
	
	onLoad = e => {
		e.target.removeEventListener("load", this.onLoad);
		e.target.parentNode.classList.add("loaded");
		e.target.style.paddingTop = "0";
	};
	
	onObserve = entries => {
		entries.forEach(entry => {
			if (!entry.isIntersecting) return;
			
			if (entry.target.id === "splashMore") {
				if (this.page !== this.totalPages && !this.isQuerying)
					this.query();
				return;
			}
			
			if (entry.target.dataset.watcher) {
				this.loadNextImage(entry.target);
			}
		});
	};
	
	onDownload = e => {
		e.preventDefault();
		const target = e.target;
		const { image, author, authorUrl, color } = target.dataset;
		
		target.classList.add("downloading");
		
		Craft.postActionRequest("splash/dl", {
			image, author, authorUrl, color
		}, (res, status) => {
			target.classList.remove("downloading");
			
			if (status !== "success" || res.hasOwnProperty("error")) {
				Craft.cp.displayError("Failed to download image.");
				return;
			}
			
			Craft.cp.displayNotice("Image downloaded successfully!");
		});
	};
	
	// Helpers
	// =========================================================================
	
	clearResults () {
		const c = this.grid.children;
		
		for (let i = 0; i < c.length; i++) {
			while (c[i].firstElementChild)
				c[i].removeChild(c[i].firstElementChild);
		
			if (!this.watchers[i]) {
				this.watchers[i] = t("span");
				this.watchers[i].dataset.watcher = true;
				this.io.observe(this.watchers[i]);
			}
			
			c[i].appendChild(this.watchers[i]);
			c[i].appendChild(t("div", { class: "splash--grid-loader" }));
		}
	}
	
	resetShortest () {
		this.shortest = [];
		
		for (let i = 0; i < this.grid.children.length; i++)
			this.shortest.push(0);
	}
	
	loadNextImage (target) {
		const next = target.nextElementSibling;
		
		if (!next || !next.classList.contains("splash--grid-image"))
			return;
		
		const img = next.querySelector("img");
		img.setAttribute("src", img.dataset.src);
		img.setAttribute("alt", img.dataset.alt);
		
		target.parentNode.insertBefore(target, next.nextElementSibling);
		
		inViewport(target) && this.loadNextImage(target);
	}
	
	render ({ urls, user, width, height, links, color }) {
		let padTop = 75;
		if (width && height) {
			padTop = (height / width) * 100;
		}
		
		const refer = "?utm_source=Splash_For_Craft_CMS&utm_medium=referral&utm_campaign=api-credit";
		
		return t("div", {
			class: "splash--grid-image",
			style: `
				padding-top: ${padTop}%;
			`,
		}, [
			t("div", { class: "splash--grid-image-top" }, [
				t("a", {
					href: user.links.html + refer,
					target: "_blank",
				}, user.name),
				t("a", {
					class: "dl",
					href: links.download + refer,
					target: "_blank",
					"data-image": links.download,
					"data-author": user.name,
					"data-author-url": user.links.html,
					"data-color": color,
					click: this.onDownload,
				}, "Download"),
			]),
			t("img", {
				"data-src": urls.small,
				"data-alt": user.name,
				load: this.onLoad,
			}),
		]);
	}
	
}