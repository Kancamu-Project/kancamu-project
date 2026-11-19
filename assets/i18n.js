// Language support shared by every web (except muOS and ArtCraft).
// A web keeps its texts in its own data.json:
//   { "name": { "en-US": "..." }, "languages": [{ "code", "name", "dir" }], "ui": { "key": { "en-US": "...", ... } } }
// Mark elements in the HTML with data-i18n (text), data-i18n-html (text with <b>/<i>, from our own data.json),
// data-i18n-title, data-i18n-placeholder, or data-i18n-label (aria-label), then call i18n.load().
(() => {
    // assets/brand.json sits next to this script. The name of the brand and its highlighted word are written there and nowhere else.
    const BRAND = new URL("brand.json", document.currentScript.src).href;
    const FALLBACK = "en-US";
    const KEY = "lang";
    const listeners = [];

    const i18n = {
        lang: FALLBACK,
        languages: [],
        ui: {},
        data: null,
        brand: { name: "", highlight: "" },

        // Loads data.json, picks the language, and applies it to the page.
        async load(url = "data.json") {
            const response = await fetch(url, { cache: "no-store" });
            if (!response.ok) throw new Error(`${url}: ${response.status}`);
            this.data = await response.json();
            await this.fillBrand();
            this.languages = this.data.languages || [];
            this.ui = this.data.ui || {};
            this.lang = this.resolve();
            this.apply();
            return this.data;
        },

        // Every text of data.json that says {brand} gets the name of the brand, and {highlight} its highlighted word.
        async fillBrand() {
            try {
                this.brand = await (await fetch(BRAND, { cache: "no-store" })).json();
            } catch {}
            const escape = (text) => JSON.stringify(text || "").slice(1, -1);
            this.data = JSON.parse(
                JSON.stringify(this.data)
                    .replaceAll("{highlight}", escape(this.brand.highlight))
                    .replaceAll("{brand}", escape(this.brand.name))
            );
        },

        sameBase(codes, lang) {
            const base = lang.split("-")[0];
            return codes.find((code) => code.split("-")[0] === base);
        },

        // Saved choice, then the browser language, then English.
        resolve() {
            const codes = this.languages.map((language) => language.code);
            let saved = null;
            try {
                saved = localStorage.getItem(KEY);
            } catch {}
            if (codes.includes(saved)) return saved;
            return codes.includes(navigator.language)
                ? navigator.language
                : this.sameBase(codes, navigator.language) || FALLBACK;
        },

        // Picks the text for the current language out of { "en-US": "...", "zh-CN": "..." }.
        pick(texts) {
            if (!texts) return "";
            const sameBase = this.sameBase(Object.keys(texts), this.lang);
            return texts[this.lang] || texts[sameBase] || texts[FALLBACK] || Object.values(texts)[0] || "";
        },

        // Translates a key from data.json "ui". {name} placeholders are filled from params.
        t(key, params = {}) {
            const text = this.ui[key] ? this.pick(this.ui[key]) : key;
            return text.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
        },

        // Sets lang and dir on the page, the title, and every marked element.
        apply(root = document) {
            const language = this.languages.find((item) => item.code === this.lang);
            document.documentElement.lang = this.lang;
            document.documentElement.dir = language?.dir || "ltr";
            if (this.data?.name) document.title = this.pick(this.data.name);
            root.querySelectorAll("[data-i18n]").forEach((element) => {
                element.textContent = this.t(element.dataset.i18n);
            });
            root.querySelectorAll("[data-i18n-html]").forEach((element) => {
                element.innerHTML = this.t(element.dataset.i18nHtml);
            });
            root.querySelectorAll("[data-i18n-title]").forEach((element) => {
                element.title = this.t(element.dataset.i18nTitle);
            });
            root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
                element.placeholder = this.t(element.dataset.i18nPlaceholder);
            });
            root.querySelectorAll("[data-i18n-label]").forEach((element) => {
                element.setAttribute("aria-label", this.t(element.dataset.i18nLabel));
            });
        },

        // Changes the language, remembers it, and tells the listeners.
        set(code) {
            if (!this.languages.some((language) => language.code === code)) return;
            this.lang = code;
            try {
                localStorage.setItem(KEY, code);
            } catch {}
            this.apply();
            document.querySelectorAll("select.language").forEach((select) => (select.value = code));
            listeners.forEach((listener) => listener(code));
        },

        // Fills every select.language with the languages and keeps them in sync.
        selects() {
            document.querySelectorAll("select.language").forEach((select) => {
                select.replaceChildren(
                    ...this.languages.map((language) => {
                        const option = document.createElement("option");
                        option.value = language.code;
                        option.textContent = language.name;
                        return option;
                    })
                );
                select.value = this.lang;
                select.onchange = () => this.set(select.value);
            });
        },

        // Runs fn after every language change, for text that script.js builds itself.
        onChange(fn) {
            listeners.push(fn);
        },

        // Formats a size, a date, or a number in the current language.
        number(value, options) {
            return new Intl.NumberFormat(this.lang, options).format(value);
        },
        date(value, options) {
            return new Date(value).toLocaleDateString(this.lang, options);
        },
    };

    // Another web of this site changed the language: follow it.
    window.addEventListener("storage", (event) => {
        if ((event.key !== KEY && event.key !== null) || !i18n.data) return;
        const code = i18n.resolve();
        if (code === i18n.lang) return;
        i18n.lang = code;
        i18n.apply();
        document.querySelectorAll("select.language").forEach((select) => (select.value = code));
        listeners.forEach((listener) => listener(code));
    });

    window.i18n = i18n;
})();
