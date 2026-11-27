import { auth as authData, brand as brandData, cleanup as cleanupData, drive as driveData, kit as kitData, popup as popupTexts } from "../data/data.js";
import { icons } from "../icons/icons.js";

export let urlState, i18n, popups, components, autocomplete, account, transfer, settings, storage;

{
    const style = document.createElement("style");
    style.id = "icons";
    style.textContent = `:root{${Object.entries(icons).map(([name, svg]) => `--icon-${name}:url("data:image/svg+xml,${encodeURIComponent(svg)}");`).join("")}}`;
    document.head.append(style);
}

{
document.addEventListener("contextmenu", (event) => event.preventDefault());
const read = () => {
    try {
        return localStorage.getItem("theme") === "light" ? "light" : "dark";
    } catch {
        return "dark";
    }
};
document.documentElement.dataset.theme = read();
window.addEventListener("storage", (event) => {
    if (event.key === "theme" || event.key === null) document.documentElement.dataset.theme = read();
});
const markTheme = () => {
    const light = document.documentElement.dataset.theme === "light";
    const mark = document.querySelector("#theme-button .icon");
    mark?.classList.toggle("icon-sun", !light);
    mark?.classList.toggle("icon-moon", light);
};
document.addEventListener("click", (event) => {
    if (!event.target.closest("#theme-button")) return;
    const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    try {
        localStorage.setItem("theme", theme);
    } catch {}
});
new MutationObserver(markTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
document.addEventListener("DOMContentLoaded", markTheme);

const covered = () => {
    try {
        return window.parent !== window && !!window.parent.document.getElementById("viewer")?.contains(window.frameElement);
    } catch {
        return false;
    }
};

const layers = new Map();
const effects = () => {
    let saved = {};
    try {
        if (!covered()) saved = JSON.parse(localStorage.getItem("appearance.settings")) || {};
    } catch {}
    if (!document.body) {
        document.addEventListener("DOMContentLoaded", effects, { once: true });
        return;
    }
    const set = (name, on, amount, moving = false) => {
        let layer = layers.get(name);
        if (on !== true) {
            layer?.remove();
            layers.delete(name);
            return;
        }
        if (!layer) {
            layer = document.createElement("div");
            layer.className = `effect effect-${name}`;
            layer.setAttribute("aria-hidden", "true");
            layers.set(name, layer);
        }
        if (!layer.isConnected) document.body.append(layer);
        layer.classList.toggle("moving", moving);
        if (Number.isFinite(Number(amount))) layer.style.setProperty("--effect-amount", String(Math.min(100, Math.max(0, Number(amount)))));
    };
    set("monochrome", saved.monochrome, saved.monochromeAmount);
    set("noise", saved.noise, saved.noiseAmount, saved.noiseMotion === true);
};
effects();
window.addEventListener("storage", (event) => {
    if (event.key === "appearance.settings" || event.key === null) effects();
});
window.addEventListener("app:settings", (event) => {
    if (event.detail?.app === "appearance") effects();
});

}

{
for (const key of cleanupData.keys) {
    try {
        if (localStorage.getItem(key) !== null) localStorage.removeItem(key);
    } catch {}
}
for (const name of cleanupData.databases) {
    try {
        indexedDB.deleteDatabase(name);
    } catch {}
}
for (const name of cleanupData.caches) {
    try {
        caches.delete(name);
    } catch {}
}

}

{
const read = () => new URLSearchParams(location.search);

urlState = {
    get(name) {
        return read().get(name) || "";
    },

    set(values) {
        const params = read();
        for (const [name, value] of Object.entries(values)) {
            if (value === "" || value === null || value === undefined || value === false) params.delete(name);
            else params.set(name, String(value));
        }
        const search = params.toString();
        if (search === location.search.slice(1)) return;
        history.replaceState(null, "", location.pathname + (search ? `?${search}` : "") + location.hash);
        if (window.parent !== window) window.parent.postMessage({ type: "app:url", search }, location.origin);
    },
};

}

{
const FALLBACK = "en-US";
const KEY = "lang";
const listeners = [];

i18n = {
    lang: FALLBACK,
    languages: [],
    ui: {},
    data: null,
    brand: { name: "", highlight: "" },

    async load(source) {
        if (!source) throw new Error("i18n.load needs the data of the app");
        this.data = source;
        this.fillBrand();
        this.languages = this.data.languages || [];
        this.ui = this.data.ui || {};
        this.lang = this.resolve();
        this.applyBrandColour();
        this.apply();
        return this.data;
    },

    applyBrandColour() {
        const hex = this.data?.brandColor;
        if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return;
        const channel = (index) => {
            const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
            return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        };
        const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
        const root = document.documentElement.style;
        root.setProperty("--brand", hex);
        root.setProperty("--brand-ink", 1.05 / (luminance + 0.05) >= 3 ? "var(--white)" : "var(--black)");
    },

    fillBrand() {
        this.brand = brandData;
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

    pick(texts) {
        if (!texts) return "";
        const sameBase = this.sameBase(Object.keys(texts), this.lang);
        return texts[this.lang] || texts[sameBase] || texts[FALLBACK] || Object.values(texts)[0] || "";
    },

    t(key, params = {}) {
        const text = this.ui[key] ? this.pick(this.ui[key]) : key;
        return text.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
    },

    apply(root = document) {
        const language = this.languages.find((item) => item.code === this.lang);
        document.documentElement.lang = this.lang;
        document.documentElement.dir = language?.dir || "ltr";
        if (this.data?.name) document.title = this.pick(this.data.name);
        if (root === document) components?.refreshTexts?.();
        if (root === document) this.selects();
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

    onChange(fn) {
        listeners.push(fn);
    },

    number(value, options) {
        return new Intl.NumberFormat(this.lang, options).format(value);
    },
    date(value, options) {
        return new Date(value).toLocaleDateString(this.lang, options);
    },
};

window.addEventListener("storage", (event) => {
    if ((event.key !== KEY && event.key !== null) || !i18n.data) return;
    const code = i18n.resolve();
    if (code === i18n.lang) return;
    i18n.lang = code;
    i18n.apply();
    document.querySelectorAll("select.language").forEach((select) => (select.value = code));
    listeners.forEach((listener) => listener(code));
});


}

{
const TOAST_TIME = 3500;
const TOAST_TIME_LONG = 6000;
let texts = popupTexts;
let element = null;
let list = null;
const root = () => document.getElementById("popups") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "popups", className: "popups" }));

async function load() {
    texts ??= popupTexts;
}

const say = (key) => (i18n ? i18n.pick(texts[key]) : texts[key]["en-US"]);

function part(tag, className, parent, hidden = false) {
    const node = document.createElement(tag);
    node.className = className + (hidden ? " hidden" : "");
    parent.appendChild(node);
    return node;
}

function build() {
    const dialog = document.createElement("dialog");
    dialog.className = "shared-dialog";
    const form = part("form", "shared-dialog-form", dialog);
    form.method = "dialog";
    const parts = {
        dialog,
        form,
        title: part("h2", "shared-dialog-title", form, true),
        text: part("span", "shared-dialog-text", form),
        input: part("input", "shared-dialog-input", form, true),
    };
    parts.input.type = "text";
    const actions = part("div", "shared-dialog-actions", form);
    parts.cancel = part("button", "shared-dialog-cancel", actions);
    parts.cancel.type = "button";
    parts.confirm = part("button", "shared-dialog-confirm primary", actions);
    parts.confirm.type = "submit";
    for (const button of [parts.cancel, parts.confirm]) button.appendChild(document.createElement("span"));
    root().appendChild(dialog);
    return parts;
}

async function show({ text = "", title = "", ok, cancel, value = null, single = false, kind = "" }) {
    await load();
    element ??= build();
    const { dialog, form, input } = element;
    if (dialog.open) dialog.close();
    dialog.dataset.kind = kind;
    element.title.textContent = title;
    element.title.classList.toggle("hidden", !title);
    element.text.textContent = text;
    element.text.classList.toggle("hidden", !text);
    element.confirm.firstChild.textContent = ok ?? say("ok");
    element.cancel.firstChild.textContent = cancel ?? say("cancel");
    element.cancel.classList.toggle("hidden", single);
    input.classList.toggle("hidden", value === null);
    input.setAttribute("aria-label", text || title);
    if (value !== null) input.value = value;

    return new Promise((resolve) => {
        let answer = value === null ? false : null;
        form.onsubmit = () => {
            answer = value === null ? true : input.value;
        };
        element.cancel.onclick = () => dialog.close();
        dialog.addEventListener("close", () => resolve(answer), { once: true });
        dialog.showModal();
        if (value !== null) {
            input.focus();
            input.select();
        } else element.confirm.focus();
    });
}

function temporary(className) {
    const dialog = document.createElement("dialog");
    dialog.className = className;
    root().appendChild(dialog);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    return dialog;
}

async function sheet({ title = "", text = "", node = null, side = "end" }) {
    await load();
    const dialog = temporary("shared-sheet");
    dialog.dataset.side = side;
    const header = part("div", "shared-sheet-header", dialog);
    part("h2", "shared-sheet-title", header).textContent = title;
    const close = part("button", "shared-sheet-close", header);
    close.type = "button";
    close.textContent = say("close");
    close.addEventListener("click", () => dialog.close());
    const body = part("div", "shared-sheet-body", dialog);
    if (node) body.appendChild(node);
    else body.textContent = text;
    return new Promise((resolve) => {
        dialog.addEventListener("close", () => { dialog.remove(); resolve(); }, { once: true });
        dialog.showModal();
        close.focus();
    });
}

async function command({ items = [], placeholder }) {
    await load();
    const dialog = temporary("shared-command");
    const input = part("input", "shared-command-input", dialog);
    input.type = "text";
    input.placeholder = placeholder ?? say("search");
    input.setAttribute("aria-label", input.placeholder);
    const list = part("div", "shared-command-list", dialog);
    let shown = items;
    let active = 0;
    let picked = null;
    const draw = () => {
        list.replaceChildren();
        if (!shown.length) part("span", "shared-command-empty", list).textContent = say("empty");
        shown.forEach((item, index) => {
            const button = part("button", "shared-command-item" + (index === active ? " on" : ""), list);
            button.type = "button";
            part("span", "", button).textContent = item.label;
            if (item.hint) part("span", "shared-command-hint", button).textContent = item.hint;
            button.addEventListener("click", () => { picked = item.value; dialog.close(); });
        });
    };
    input.addEventListener("input", () => {
        const query = input.value.trim().toLowerCase();
        shown = items.filter((item) => item.label.toLowerCase().includes(query));
        active = 0;
        draw();
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (shown.length) active = (active + (event.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length;
            draw();
            list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
        } else if (event.key === "Enter" && shown[active]) {
            event.preventDefault();
            picked = shown[active].value;
            dialog.close();
        }
    });
    draw();
    return new Promise((resolve) => {
        dialog.addEventListener("close", () => { dialog.remove(); resolve(picked); }, { once: true });
        dialog.showModal();
        input.focus();
    });
}

function buildList() {
    const node = document.createElement("div");
    node.className = "shared-toasts";
    node.setAttribute("popover", "manual");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    root().appendChild(node);
    return node;
}

function toast(text, { progress = null, kind = progress === null ? "success" : "info", duration = kind === "error" || kind === "warning" ? TOAST_TIME_LONG : TOAST_TIME } = {}) {
    list ??= buildList();
    const note = part("div", `shared-toast ${kind}` + (progress === null ? "" : " with-bar"), list);
    part("span", "shared-toast-icon", note);
    const label = part("span", "shared-toast-text", note);
    label.textContent = text;
    const fill = progress === null ? null : part("i", "shared-toast-fill", part("div", "shared-toast-bar", note));
    let timer = 0;

    const close = () => {
        clearTimeout(timer);
        note.remove();
        if (!list.children.length && list.matches(":popover-open")) list.hidePopover();
    };
    const set = (newText, newProgress) => {
        if (newText !== undefined) label.textContent = newText;
        if (fill && newProgress !== undefined) fill.style.width = Math.round(newProgress * 100) + "%";
    };
    set(undefined, progress ?? 0);

    if (list.matches(":popover-open")) list.hidePopover();
    list.showPopover();
    if (duration) timer = setTimeout(close, duration);
    return { set, close };
}

popups = {
    ask: (options = {}) => show(options),
    tell: (options = {}) => show({ ...options, single: true }),
    sheet,
    command,
    toast,
};

}

{
function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

const icon = (name) => element("span", `icon icon-${name}`);

const extensionOf = (name) => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");

function formatSize(bytes) {
    const number = (value) => (i18n ? i18n.number(value, { maximumFractionDigits: value < 10 ? 1 : 0 }) : value.toFixed(value < 10 ? 1 : 0));
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = -1;
    do {
        value /= 1024;
        index++;
    } while (value >= 1024 && index < units.length - 1);
    return `${number(value)} ${units[index]}`;
}

function status(node) {
    return (text) => { node.textContent = text; };
}

function drawer({ sidebar, button, focus = ".sidebar-item.on, .sidebar-item:not(:disabled)" }) {
    const set = (open) => {
        sidebar.classList.toggle("open", open);
        button.setAttribute("aria-expanded", String(open));
        if (open) sidebar.querySelector(focus)?.focus();
    };
    button.addEventListener("click", () => set(!sidebar.classList.contains("open")));
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && sidebar.classList.contains("open") && button.offsetParent) {
            event.stopImmediatePropagation();
            set(false);
            button.focus();
        }
    });
    return { set };
}

function download(name, content, type = "application/octet-stream") {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

function expand({ toggle, body, open = true }) {
    const set = (value) => {
        body.hidden = !value;
        toggle.setAttribute("aria-expanded", String(value));
    };
    toggle.addEventListener("click", () => set(body.hidden));
    set(open);
    return { set };
}

let open = null;

const closeOpen = () => open?.close();

function place(node, { anchor, point, align }) {
    const margin = 8;
    const gap = 6;
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    let left;
    let top;
    if (point) {
        left = point.x;
        top = point.y;
    } else {
        const box = anchor.getBoundingClientRect();
        const atEnd = (align === "end") !== rtl;
        left = atEnd ? box.right - node.offsetWidth : box.left;
        top = box.bottom + gap;
        if (top + node.offsetHeight > window.innerHeight - margin) top = box.top - node.offsetHeight - gap;
    }
    node.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - node.offsetWidth - margin))}px`;
    node.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - node.offsetHeight - margin))}px`;
}

function show(node, { anchor, point, align = "start" }) {
    const again = open && anchor && open.anchor === anchor;
    closeOpen();
    if (again) return null;
    (document.getElementById("popups") ?? document.body).appendChild(node);
    place(node, { anchor, point, align });
    const outside = (event) => { if (!node.contains(event.target) && !anchor?.contains(event.target)) close(); };
    const escape = (event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        close(true);
    };
    const scrolled = (event) => { if (!node.contains(event.target)) close(); };
    const close = (refocus = false) => {
        if (open?.node !== node) return;
        node.remove();
        document.removeEventListener("pointerdown", outside, true);
        document.removeEventListener("keydown", escape, true);
        window.removeEventListener("resize", close);
        document.removeEventListener("scroll", scrolled, true);
        open = null;
        if (refocus) anchor?.focus();
    };
    open = { node, anchor, close };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", scrolled, true);
    return { node, close };
}

function menu({ anchor, point, items, align, scroll = false }) {
    const node = element("div", "menu");
    node.setAttribute("role", "menu");
    if (scroll) {
        node.style.maxHeight = "min(32rem, 60vh)";
        node.style.overflowY = "auto";
    }
    const buttons = [];
    let handle = null;
    for (const entry of items) {
        if (entry.separator) {
            node.appendChild(element("hr", "menu-separator"));
            continue;
        }
        const button = element("button", `menu-item${entry.danger ? " danger" : ""}`);
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.disabled = !!entry.disabled;
        if (entry.icon) button.appendChild(icon(entry.icon));
        button.appendChild(element("span", "", entry.label));
        button.addEventListener("click", () => {
            const keep = entry.onSelect?.({ button, close: () => handle.close(true) }) === false;
            if (!keep) handle.close(true);
        });
        buttons.push(button);
        node.appendChild(button);
    }
    handle = show(node, { anchor, point, align });
    if (!handle) return null;
    node.addEventListener("keydown", (event) => {
        const enabled = buttons.filter((button) => !button.disabled);
        const index = enabled.indexOf(document.activeElement);
        if (event.key === "ArrowDown") {
            event.preventDefault();
            enabled[(index + 1) % enabled.length].focus();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            enabled[(index - 1 + enabled.length) % enabled.length].focus();
        } else if (event.key === "Home") {
            event.preventDefault();
            enabled[0].focus();
        } else if (event.key === "End") {
            event.preventDefault();
            enabled[enabled.length - 1].focus();
        } else if (event.key === "Tab") handle.close();
    });
    buttons.find((button) => !button.disabled)?.focus();
    return handle;
}

function popover({ anchor, content, align }) {
    const node = element("div", "popover");
    node.tabIndex = -1;
    node.append(content);
    const handle = show(node, { anchor, align });
    if (!handle) return null;
    (node.querySelector("button, input, select, textarea, a[href]") ?? node).focus();
    return handle;
}

function select({ trigger, options, value, onChange }) {
    const label = element("span");
    trigger.classList.add("select-trigger");
    trigger.replaceChildren(label, icon("chevron-down"));
    let current = value ?? options[0]?.value;
    const refresh = () => {
        label.textContent = options.find((option) => option.value === current)?.label ?? "";
    };
    refresh();
    trigger.addEventListener("click", () => {
        const handle = menu({
            anchor: trigger,
            items: options.map((option) => ({
                label: option.label,
                icon: option.value === current ? "check" : "blank",
                onSelect: () => {
                    current = option.value;
                    refresh();
                    onChange?.(current);
                },
            })),
        });
        if (handle) handle.node.style.minWidth = `${trigger.offsetWidth}px`;
    });
    return {
        get value() {
            return current;
        },
        set(next) {
            current = next;
            refresh();
        },
    };
}

function enhanceSelect(native) {
    if (native.dataset.kitSelect !== undefined || native.hasAttribute("data-native")) return;
    native.dataset.kitSelect = "";
    const choose = () => {
        if (native.disabled) return;
        const handle = menu({
            anchor: native,
            scroll: true,
            items: [...native.options].filter((option) => !option.hidden).map((option) => ({
                label: option.textContent,
                icon: option.selected ? "check" : "blank",
                disabled: option.disabled,
                onSelect: () => {
                    if (native.value === option.value) return;
                    native.value = option.value;
                    native.dispatchEvent(new Event("input", { bubbles: true }));
                    native.dispatchEvent(new Event("change", { bubbles: true }));
                },
            })),
        });
        if (!handle) return;
        handle.node.style.minWidth = `${native.offsetWidth}px`;
        const picked = [...handle.node.querySelectorAll(".menu-item")].find((button) => button.querySelector(".icon-check"));
        if (picked) { picked.focus(); picked.scrollIntoView({ block: "nearest" }); }
    };
    native.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        native.focus();
        choose();
    });
    native.addEventListener("keydown", (event) => {
        if (![" ", "Enter", "ArrowDown", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        choose();
    });
}
const placeSlider = (input) => {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    input.style.setProperty("--position", max > min ? String(Math.min(1, Math.max(0, (Number(input.value) - min) / (max - min)))) : "0");
};
function enhanceSlider(input) {
    if (input.dataset.kitSlider !== undefined) return;
    input.dataset.kitSlider = "";
    const own = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(input, "value", { configurable: true, get() { return own.get.call(this); }, set(next) { own.set.call(this, next); placeSlider(this); } });
    input.addEventListener("input", () => placeSlider(input));
    new MutationObserver(() => placeSlider(input)).observe(input, { attributes: true, attributeFilter: ["min", "max", "value", "step"] });
    placeSlider(input);
}
const enhanceSelects = (root) => {
    if (root.matches?.("select")) enhanceSelect(root);
    root.querySelectorAll?.("select").forEach(enhanceSelect);
    if (root.matches?.("input.slider")) enhanceSlider(root);
    root.querySelectorAll?.("input.slider").forEach(enhanceSlider);
};
enhanceSelects(document);
new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => node.nodeType === 1 && enhanceSelects(node)))).observe(document.documentElement, { childList: true, subtree: true });

function otp({ length = 6, onComplete }) {
    const box = element("div", "otp");
    const inputs = [];
    const value = () => inputs.map((input) => input.value).join("");
    const check = () => {
        if (value().length === length) onComplete?.(value());
    };
    for (let index = 0; index < length; index++) {
        const input = element("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.maxLength = 1;
        input.autocomplete = "one-time-code";
        input.setAttribute("aria-label", String(index + 1));
        input.addEventListener("input", () => {
            input.value = input.value.replace(/\D/g, "").slice(-1);
            if (input.value) inputs[index + 1]?.focus();
            check();
        });
        input.addEventListener("keydown", (event) => {
            if (event.key === "Backspace" && !input.value) inputs[index - 1]?.focus();
        });
        input.addEventListener("paste", (event) => {
            event.preventDefault();
            const digits = (event.clipboardData?.getData("text") ?? "").replace(/\D/g, "").slice(0, length - index);
            [...digits].forEach((digit, offset) => { inputs[index + offset].value = digit; });
            inputs[Math.min(index + digits.length, length - 1)].focus();
            check();
        });
        inputs.push(input);
        box.appendChild(input);
    }
    return {
        element: box,
        get value() {
            return value();
        },
        clear() {
            inputs.forEach((input) => { input.value = ""; });
            inputs[0].focus();
        },
    };
}

function resizable(container) {
    const handle = container.querySelector(".resizable-handle");
    const first = handle.previousElementSibling;
    const vertical = container.classList.contains("vertical");
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", vertical ? "horizontal" : "vertical");
    const set = (pixels) => {
        const total = (vertical ? container.clientHeight : container.clientWidth) - (vertical ? handle.offsetHeight : handle.offsetWidth);
        const size = Math.max(total * 0.1, Math.min(pixels, total * 0.9));
        first.style.flex = `none`;
        first.style[vertical ? "height" : "width"] = `${size}px`;
    };
    handle.addEventListener("pointerdown", (event) => {
        handle.setPointerCapture(event.pointerId);
        const move = (moveEvent) => {
            const box = container.getBoundingClientRect();
            const rtl = getComputedStyle(container).direction === "rtl";
            set(vertical ? moveEvent.clientY - box.top : rtl ? box.right - moveEvent.clientX : moveEvent.clientX - box.left);
        };
        const stop = () => {
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", stop);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", stop);
    });
    handle.addEventListener("keydown", (event) => {
        const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 16 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -16 : 0;
        if (!step) return;
        event.preventDefault();
        const rtl = getComputedStyle(container).direction === "rtl" && !vertical;
        set((vertical ? first.offsetHeight : first.offsetWidth) + (rtl ? -step : step));
    });
    return { set };
}

function carousel(root) {
    const track = root.querySelector(".carousel-track");
    const sign = getComputedStyle(root).direction === "rtl" ? -1 : 1;
    const go = (direction) => track.scrollBy({ left: direction * sign * track.clientWidth, behavior: "smooth" });
    root.querySelector('[data-carousel="previous"]').addEventListener("click", () => go(-1));
    root.querySelector('[data-carousel="next"]').addEventListener("click", () => go(1));
}

function calendar({ value = new Date(), selected = null, onSelect }) {
    const language = i18n?.lang ?? navigator.language;
    let view = new Date(value.getFullYear(), value.getMonth(), 1);
    let picked = selected;
    const locale = new Intl.Locale(language);
    const firstDay = ((locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay ?? 7) % 7;
    const number = new Intl.NumberFormat(language);
    const box = element("div", "calendar");
    const header = element("div", "calendar-header");
    const previous = element("button", "square");
    const title = element("span", "calendar-title");
    const next = element("button", "square");
    previous.type = next.type = "button";
    previous.append(icon("chevron-left"));
    next.append(icon("chevron-right"));
    previous.setAttribute("aria-label", "-");
    next.setAttribute("aria-label", "+");
    header.append(previous, title, next);
    const grid = element("div", "calendar-grid");
    box.append(header, grid);
    const same = (a, b) => a && b && a.toDateString() === b.toDateString();
    const draw = () => {
        title.textContent = new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(view);
        grid.replaceChildren();
        const names = new Intl.DateTimeFormat(language, { weekday: "short" });
        for (let day = 0; day < 7; day++) grid.append(element("span", "calendar-weekday", names.format(new Date(2024, 0, 7 + ((firstDay + day) % 7)))));
        const start = new Date(view.getFullYear(), view.getMonth(), 1 - ((view.getDay() - firstDay + 7) % 7));
        for (let index = 0; index < 42; index++) {
            const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
            const button = element("button", "calendar-day", number.format(date.getDate()));
            button.type = "button";
            button.classList.toggle("outside", date.getMonth() !== view.getMonth());
            button.classList.toggle("today", same(date, new Date()));
            button.classList.toggle("on", same(date, picked));
            button.addEventListener("click", () => {
                picked = date;
                if (date.getMonth() !== view.getMonth()) view = new Date(date.getFullYear(), date.getMonth(), 1);
                draw();
                onSelect?.(date);
            });
            grid.append(button);
        }
    };
    previous.addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); draw(); });
    next.addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); draw(); });
    draw();
    return {
        element: box,
        get value() {
            return picked;
        },
    };
}

function chart({ type = "bar", data, width = 320, height = 160 }) {
    const namespace = "http://www.w3.org/2000/svg";
    const make = (tag, attributes, className) => {
        const node = document.createElementNS(namespace, tag);
        for (const [name, text] of Object.entries(attributes)) node.setAttribute(name, text);
        if (className) node.setAttribute("class", className);
        return node;
    };
    const svg = make("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" }, "chart");
    const left = 8;
    const bottom = 22;
    const top = 8;
    const plotWidth = width - left * 2;
    const plotHeight = height - top - bottom;
    const maximum = Math.max(...data.map((point) => point.value), 1);
    const slot = plotWidth / data.length;
    svg.append(make("line", { x1: left, y1: top + plotHeight, x2: width - left, y2: top + plotHeight }, "chart-axis"));
    const points = data.map((point, index) => {
        const x = left + slot * index + slot / 2;
        const y = top + plotHeight - (point.value / maximum) * plotHeight;
        const label = make("text", { x, y: height - 6 }, "chart-label");
        label.textContent = point.label;
        svg.append(label);
        if (type === "bar") svg.append(make("rect", { x: x - slot * 0.3, y, width: slot * 0.6, height: top + plotHeight - y, rx: 2 }, "chart-bar"));
        return [x, y];
    });
    if (type === "line") {
        svg.append(make("polyline", { points: points.map((point) => point.join(",")).join(" ") }, "chart-line"));
        points.forEach(([x, y]) => svg.append(make("circle", { cx: x, cy: y, r: 3 }, "chart-dot")));
    }
    return svg;
}

function dataTable({ columns, rows, pageSize = 5, labels = {} }) {
    const text = { filter: "Filter...", previous: "Previous", next: "Next", empty: "No results.", ...labels };
    const state = { query: "", key: null, direction: "ascending", page: 0 };
    const box = element("div", "data-table");
    const search = element("label", "searchbox");
    const input = element("input");
    input.type = "search";
    input.placeholder = text.filter;
    input.setAttribute("aria-label", text.filter);
    search.append(icon("search"), input);
    const table = element("table", "table");
    const footer = element("div", "data-table-footer");
    const count = element("span");
    const pages = element("div", "pagination");
    const previous = element("button", "", text.previous);
    const following = element("button", "", text.next);
    previous.type = following.type = "button";
    pages.append(previous, following);
    footer.append(count, pages);
    const scroll = element("div", "scroll-area");
    scroll.append(table);
    box.append(search, scroll, footer);
    const draw = () => {
        const query = state.query.toLowerCase();
        let shown = rows.filter((row) => columns.some((column) => String(row[column.key]).toLowerCase().includes(query)));
        if (state.key) {
            const sign = state.direction === "ascending" ? 1 : -1;
            shown = [...shown].sort((a, b) => sign * String(a[state.key]).localeCompare(String(b[state.key]), undefined, { numeric: true }));
        }
        const last = Math.max(0, Math.ceil(shown.length / pageSize) - 1);
        state.page = Math.min(state.page, last);
        const head = element("thead");
        const headRow = element("tr");
        for (const column of columns) {
            const cell = element("th");
            const sort = element("button", "table-sort");
            sort.type = "button";
            sort.append(element("span", "", column.label), icon("arrow-down"));
            if (state.key === column.key) sort.dataset.sort = state.direction;
            cell.setAttribute("aria-sort", state.key === column.key ? state.direction : "none");
            sort.addEventListener("click", () => {
                state.direction = state.key === column.key && state.direction === "ascending" ? "descending" : "ascending";
                state.key = column.key;
                draw();
            });
            cell.append(sort);
            headRow.append(cell);
        }
        head.append(headRow);
        const body = element("tbody");
        const page = shown.slice(state.page * pageSize, state.page * pageSize + pageSize);
        if (!page.length) {
            const cell = element("td", "", text.empty);
            cell.colSpan = columns.length;
            const empty = element("tr");
            empty.append(cell);
            body.append(empty);
        }
        for (const row of page) {
            const line = element("tr");
            for (const column of columns) line.append(element("td", "", String(row[column.key])));
            body.append(line);
        }
        table.replaceChildren(head, body);
        count.textContent = `${shown.length ? state.page * pageSize + 1 : 0}–${state.page * pageSize + page.length} / ${shown.length}`;
        previous.disabled = state.page === 0;
        following.disabled = state.page >= last;
    };
    input.addEventListener("input", () => { state.query = input.value; state.page = 0; draw(); });
    previous.addEventListener("click", () => { state.page--; draw(); });
    following.addEventListener("click", () => { state.page++; draw(); });
    draw();
    return { element: box };
}

function scroller(container) {
    let following = true;
    const atEnd = () => container.scrollHeight - container.scrollTop - container.clientHeight < 8;
    container.addEventListener("scroll", () => { following = atEnd(); });
    return {
        follow() {
            if (following) container.scrollTop = container.scrollHeight;
        },
        toEnd() {
            following = true;
            container.scrollTop = container.scrollHeight;
        },
        get following() {
            return following;
        },
    };
}

function questionnaire({ items, labels = {}, onSubmit }) {
    const text = { previous: "Previous", next: "Next", skip: "Skip", submit: "Submit", required: "Choose an answer.", other: "Another answer", progress: "Question {n} of {total}", ...labels };
    const answers = {};
    let index = 0;
    const box = element("div", "questionnaire");
    const draw = () => {
        const item = items[index];
        const progress = element("span", "questionnaire-progress", text.progress.replace("{n}", index + 1).replace("{total}", items.length));
        const title = element("span", "questionnaire-title", item.prompt);
        const description = element("span", "questionnaire-description", item.description ?? "");
        const list = element("div", "choices");
        const error = element("span", "error");
        const choose = (value) => {
            if (item.multiple) {
                const chosen = new Set(answers[item.name] ?? []);
                chosen.has(value) ? chosen.delete(value) : chosen.add(value);
                answers[item.name] = [...chosen];
            } else answers[item.name] = value;
            draw();
        };
        item.choices.forEach((choice, position) => {
            const button = element("button", "choice");
            button.type = "button";
            const wording = element("span", "choice-text", choice.label);
            if (choice.description) wording.append(element("span", "choice-description", choice.description));
            button.append(element("span", "choice-key", String.fromCharCode(65 + position)), wording);
            const answer = answers[item.name];
            button.classList.toggle("on", item.multiple ? (answer ?? []).includes(choice.value) : answer === choice.value);
            button.addEventListener("click", () => choose(choice.value));
            list.append(button);
        });
        const parts = [progress, title, description, list];
        if (item.input) {
            const field = element("input");
            field.type = "text";
            field.placeholder = item.input.placeholder ?? text.other;
            field.setAttribute("aria-label", item.input.label ?? text.other);
            field.value = item.choices.some((choice) => choice.value === answers[item.name]) ? "" : (answers[item.name] ?? "");
            field.addEventListener("input", () => { answers[item.name] = field.value; });
            parts.push(field);
        }
        const actions = element("div", "questionnaire-actions");
        const last = index === items.length - 1;
        const previous = element("button", "ghost", text.previous);
        previous.type = "button";
        previous.disabled = index === 0;
        previous.addEventListener("click", () => { index--; draw(); });
        const skip = element("button", "ghost", text.skip);
        skip.type = "button";
        skip.addEventListener("click", () => { delete answers[item.name]; if (last) onSubmit?.(answers); else { index++; draw(); } });
        const forward = element("button", "primary", last ? text.submit : text.next);
        forward.type = "button";
        forward.addEventListener("click", () => {
            const answer = answers[item.name];
            if (item.required && (answer === undefined || answer === "" || (Array.isArray(answer) && !answer.length))) {
                error.textContent = text.required;
                return;
            }
            if (last) onSubmit?.(answers);
            else { index++; draw(); }
        });
        actions.append(previous);
        if (!item.required) actions.append(skip);
        actions.append(forward);
        parts.push(error, actions);
        box.replaceChildren(...parts);
    };
    draw();
    return { element: box, answers };
}

const KIND_ICON = { success: "check", info: "info", warning: "warning", error: "alert" };

let kitTexts = kitData;
const kitText = (key) => (kitTexts?.[key] ? (i18n?.lang ? i18n.pick(kitTexts[key]) : kitTexts[key]["en-US"]) : "");
const withTexts = new Set();
let refreshing = false;
function refreshTexts() {
    refreshing = true;
    for (const host of withTexts) host.render();
    refreshing = false;
}

function defineElement(name, attributes, build, { live = null, texts = false } = {}) {
    class Kit extends HTMLElement {
        static get observedAttributes() {
            return attributes;
        }

        connectedCallback() {
            if (!this.rendered) this.render();
            if (texts) withTexts.add(this);
        }

        disconnectedCallback() {
            withTexts.delete(this);
        }

        attributeChangedCallback() {
            if (this.rendered && !this.updating) this.render();
        }

        render() {
            this.updating = true;
            this.observer?.disconnect();
            for (const attribute of attributes) {
                const key = this.getAttribute(`data-i18n-${attribute}`);
                if (key !== null && i18n?.data) this.setAttribute(attribute, i18n.t(key));
            }
            if (live) this.original = [...this.childNodes].filter(live);
            else if (!this.rendered) this.original = [...this.childNodes];
            this.rendered = true;
            const slots = {};
            const content = [];
            for (const node of this.original) {
                const slot = node.nodeType === 1 ? node.getAttribute("slot") : null;
                if (slot) (slots[slot] ??= []).push(node);
                else content.push(node);
            }
            const classes = build(this, { content, slots, refresh: refreshing }).filter(Boolean);
            this.classList.remove(...(this.managed ?? []));
            this.classList.add(...classes);
            this.managed = classes;
            if (!refreshing && i18n?.data) i18n.apply(this);
            if (live && this.isConnected) {
                this.observer ??= new MutationObserver(() => { if (!this.updating) this.render(); });
                this.observer.observe(this, { childList: true });
            }
            this.updating = false;
        }
    }
    for (const attribute of attributes) {
        Object.defineProperty(Kit.prototype, attribute, {
            get() {
                return this.getAttribute(attribute) ?? "";
            },
            set(value) {
                if (value === false || value == null) this.removeAttribute(attribute);
                else this.setAttribute(attribute, value === true ? "" : value);
            },
        });
    }
    customElements.define(`kit-${name}`, Kit);
}

const hasContent = (nodes) => nodes.some((node) => node.nodeType === 1 || node.textContent.trim());
const attributeOf = (host, name) => host.getAttribute(name) ?? "";
let counter = 0;

defineElement("alert", ["kind", "heading"], (host, { content }) => {
    const kind = host.getAttribute("kind") || "info";
    host.setAttribute("role", "alert");
    const body = element("div", "alert-body");
    if (host.getAttribute("heading")) body.append(element("span", "alert-title", host.getAttribute("heading")));
    const text = element("span", "alert-text");
    text.append(...content);
    body.append(text);
    host.replaceChildren(icon(KIND_ICON[kind] ?? "info"), body);
    return ["alert", kind];
});

defineElement("card", ["heading", "description"], (host, { content, slots }) => {
    const parts = [];
    if (host.getAttribute("heading") || host.getAttribute("description")) {
        const header = element("div", "card-header");
        if (host.getAttribute("heading")) header.append(element("span", "card-title", host.getAttribute("heading")));
        if (host.getAttribute("description")) header.append(element("span", "card-description", host.getAttribute("description")));
        parts.push(header);
    }
    if (hasContent(content)) {
        const body = element("div", "card-content");
        body.append(...content);
        parts.push(body);
    }
    if (slots.footer) {
        const footer = element("div", "card-footer");
        footer.append(...slots.footer);
        parts.push(footer);
    }
    host.replaceChildren(...parts);
    return ["card"];
});

defineElement("item", ["heading", "description"], (host, { content, slots }) => {
    const body = element("div", "item-body");
    if (host.getAttribute("heading")) body.append(element("span", "item-title", host.getAttribute("heading")));
    if (host.getAttribute("description")) body.append(element("span", "item-description", host.getAttribute("description")));
    if (hasContent(content)) body.append(...content);
    host.replaceChildren(...(slots.media ?? []), body, ...(slots.actions ?? []));
    return ["item"];
});

defineElement("empty", ["icon", "heading", "text"], (host, { content, slots }) => {
    const illustration = element("div", "empty-illustration");
    illustration.append(icon(host.getAttribute("icon") || "folder"));
    const text = element("span", "empty-text", host.getAttribute("text") ?? "");
    if (!text.textContent && hasContent(content)) text.append(...content);
    host.replaceChildren(illustration, element("span", "empty-title", host.getAttribute("heading") ?? ""), text, ...(slots.action ?? []));
    return ["empty-state"];
});

defineElement("attachment", ["name", "detail", "icon", "image", "kind"], (host, { slots }) => {
    const media = element("span", "attachment-media");
    if (host.getAttribute("image")) media.style.backgroundImage = `url("${host.getAttribute("image")}")`;
    else media.append(icon(host.getAttribute("icon") || "file"));
    const body = element("div", "attachment-content");
    body.append(element("span", "attachment-title", host.getAttribute("name") ?? ""), element("span", "attachment-description", host.getAttribute("detail") ?? ""));
    const parts = [media, body];
    if (slots.actions) {
        const actions = element("div", "attachment-actions");
        actions.append(...slots.actions);
        parts.push(actions);
    }
    host.replaceChildren(...parts);
    return ["attachment", host.getAttribute("kind") === "error" ? "error" : null];
});

defineElement("message", ["end", "heading", "footer", "avatar", "bubble"], (host, { content, slots }) => {
    const parts = [];
    if (host.hasAttribute("avatar")) {
        const avatar = element("span", "message-avatar");
        avatar.append(element("span", "avatar", host.getAttribute("avatar")));
        parts.push(avatar);
    }
    const column = element("div", "message-content");
    if (host.getAttribute("heading")) column.append(element("div", "message-header", host.getAttribute("heading")));
    const bubble = element("div", `bubble${host.getAttribute("bubble") ? ` ${host.getAttribute("bubble")}` : ""}`);
    bubble.append(...content);
    column.append(bubble);
    if (slots.footer) {
        for (const node of slots.footer) {
            node.classList.add("message-footer");
            column.append(node);
        }
    } else if (host.getAttribute("footer")) column.append(element("div", "message-footer", host.getAttribute("footer")));
    host.parts = { bubble };
    host.replaceChildren(...parts, column);
    return ["message", host.hasAttribute("end") ? "end" : null];
});

defineElement("header", ["theme", "language", "menu", "menu-label", "menu-text", "no-account", "name"], (host, { refresh }) => {
    if (refresh && host.querySelector(".header-tools")) {
        const names = { "theme-button": "theme", "account-button": "account", "menu-button": "menu" };
        for (const button of host.querySelectorAll(".header-tools button")) {
            const label = button.id === "menu-button" ? host.getAttribute("menu-label") || kitText("menu") : kitText(names[button.id]);
            button.setAttribute("aria-label", label);
            if (button.querySelector("span:not(.icon)")) button.querySelector("span:not(.icon)").textContent = label;
            else button.title = label;
        }
        return host.managed;
    }
    const logo = element("div", "logo");
    const name = element("span", "logo-name");
    if (host.getAttribute("name")) name.innerHTML = host.getAttribute("name");
    else name.setAttribute("data-i18n-html", "logo");
    logo.append(element("div", "logo-mark"), name);
    const tools = element("div", "header-tools");
    const tool = (id, className, iconName, label) => {
        const button = element("button", className);
        button.id = id;
        button.type = "button";
        button.append(icon(iconName));
        button.title = label;
        button.setAttribute("aria-label", label);
        return button;
    };
    if (host.hasAttribute("language")) {
        const select = element("select", "language");
        select.setAttribute("data-i18n-label", "language");
        tools.append(select);
    }
    if (host.hasAttribute("theme")) tools.append(tool("theme-button", "square", document.documentElement.dataset.theme === "light" ? "moon" : "sun", kitText("theme")));
    if (!host.hasAttribute("no-account")) tools.append(tool("account-button", "ghost square account", "user", kitText("account")));
    if (host.hasAttribute("menu")) {
        const label = host.getAttribute("menu-label") || kitText("menu");
        const withText = host.hasAttribute("menu-text");
        const button = tool("menu-button", withText ? "menu-button" : "ghost square menu-button", "menu", label);
        button.setAttribute("aria-controls", "sidebar");
        button.setAttribute("aria-expanded", "false");
        if (withText) {
            button.removeAttribute("title");
            button.append(element("span", "", label));
        }
        tools.append(button);
    }
    host.id ||= "header";
    host.replaceChildren(logo, tools);
    return ["header"];
}, { texts: true });

defineElement("sidebar", ["tablist", "label"], (host, { content, slots }) => {
    const kept = host.querySelector(":scope > #sidebar-nav");
    const nav = kept ?? element("div", "sidebar-nav");
    nav.id = "sidebar-nav";
    if (host.hasAttribute("tablist")) nav.setAttribute("role", "tablist");
    if (host.getAttribute("label")) nav.setAttribute("aria-label", host.getAttribute("label"));
    if (!kept) nav.append(...content);
    host.id ||= "sidebar";
    host.replaceChildren(...(slots.before ?? []), nav, ...(slots.after ?? []));
    return ["sidebar"];
});

defineElement("footer", ["status", "brand"], (host, { refresh }) => {
    const copyright = kitText("copyright").replace("{brand}", host.getAttribute("brand") ?? i18n?.brand?.name ?? "");
    if (refresh && host.querySelector(".copyright")) {
        host.querySelector(".copyright").textContent = copyright;
        return host.managed;
    }
    const parts = [];
    if (host.hasAttribute("status")) {
        const status = element("span");
        status.id = "status";
        parts.push(status);
    }
    const link = element("a", "copyright", copyright);
    link.href = "/";
    link.target = "_top";
    parts.push(link);
    host.id ||= "footer";
    const old = host.querySelector("#status");
    if (old && parts[0]?.id === "status") parts[0] = old;
    host.replaceChildren(...parts);
    return ["footer"];
}, { texts: true });

defineElement("collapsible", ["heading", "open"], (host, { content }) => {
    const toggle = element("button", "section-toggle");
    toggle.type = "button";
    toggle.append(element("span", "", host.getAttribute("heading") ?? ""), icon("chevron-down"));
    const body = element("div", "section-body");
    body.append(...content);
    expand({ toggle, body, open: host.hasAttribute("open") });
    toggle.addEventListener("click", () => {
        host.updating = true;
        host.toggleAttribute("open", !body.hidden);
        host.updating = false;
    });
    host.replaceChildren(toggle, body);
    host.parts = { toggle, body };
    return ["collapsible"];
});

defineElement("breadcrumbs", [], (host, { content }) => {
    const parts = [];
    content.filter((node) => node.nodeType === 1).forEach((node, index) => {
        node.classList.add("breadcrumb");
        if (index) {
            const separator = icon("chevron-right");
            separator.classList.add("breadcrumb-separator");
            parts.push(separator);
        }
        parts.push(node);
    });
    host.replaceChildren(...parts);
    return ["breadcrumbs"];
}, { live: (node) => !(node.nodeType === 1 && node.classList.contains("breadcrumb-separator")) });

defineElement("tabs", ["value"], (host, { content }) => {
    host.setAttribute("role", "tablist");
    const buttons = content.filter((node) => node.nodeType === 1);
    for (const button of buttons) {
        const on = (button.getAttribute("value") ?? button.textContent.trim()) === host.getAttribute("value");
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(on));
        button.classList.toggle("on", on);
        button.onclick = () => {
            host.value = button.getAttribute("value") ?? button.textContent.trim();
            host.dispatchEvent(new CustomEvent("change", { detail: { value: host.value } }));
        };
    }
    host.replaceChildren(...buttons);
    return ["tabs"];
});

defineElement("pagination", ["pages", "page"], (host) => {
    const pages = Math.max(1, Number(host.getAttribute("pages")) || 1);
    const page = Math.min(pages, Math.max(1, Number(host.getAttribute("page")) || 1));
    const go = (value) => {
        host.page = value;
        host.dispatchEvent(new CustomEvent("change", { detail: { page: value } }));
    };
    const button = (label, value, on = false, disabled = false) => {
        const node = element("button", on ? "on" : "", label);
        node.type = "button";
        node.disabled = disabled;
        node.addEventListener("click", () => go(value));
        return node;
    };
    const numbers = [];
    for (let number = 1; number <= pages; number++) if (pages <= 7 || number === 1 || number === pages || Math.abs(number - page) <= 1) numbers.push(number);
    const parts = [button(kitText("previous"), page - 1, false, page === 1)];
    numbers.forEach((number, index) => {
        if (index && number - numbers[index - 1] > 1) parts.push(element("span", "", "…"));
        parts.push(button(String(number), number, number === page));
    });
    parts.push(button(kitText("next"), page + 1, false, page === pages));
    host.replaceChildren(...parts);
    return ["pagination"];
}, { texts: true });

defineElement("trace-line", ["icon", "heading", "description", "status"], (host, { content }) => {
    const status = host.getAttribute("status") ?? "";
    const detail = hasContent(content);
    const line = element(detail ? "button" : "div", `trace-line${status ? ` ${status}` : ""}`);
    if (detail) line.type = "button";
    line.append(icon(host.getAttribute("icon") || "file"), element("span", "trace-title", host.getAttribute("heading") ?? ""));
    if (host.getAttribute("description")) line.append(element("span", "trace-description", host.getAttribute("description")));
    const parts = [line];
    if (detail) {
        line.append(icon("chevron-down"));
        const body = element("div", "trace-detail");
        body.append(...content);
        expand({ toggle: line, body, open: false });
        parts.push(body);
    }
    host.replaceChildren(...parts);
    return ["trace-item"];
});

defineElement("marker", ["variant", "icon", "status", "shimmer"], (host, { content }) => {
    const variant = host.getAttribute("variant") ?? "";
    const text = element("span", host.hasAttribute("shimmer") ? "shimmer" : "");
    text.append(...content);
    const parts = [];
    if (host.hasAttribute("status")) {
        host.setAttribute("role", "status");
        parts.push(element("span", "spinner"));
    } else if (host.getAttribute("icon")) parts.push(icon(host.getAttribute("icon")));
    parts.push(text);
    host.replaceChildren(...parts);
    return ["marker", variant];
});

defineElement("field", ["label", "hint"], (host, { content }) => {
    const control = content.find((node) => node.nodeType === 1 && /^(input|select|textarea|button)$/i.test(node.tagName)) ?? content.find((node) => node.nodeType === 1);
    const parts = [];
    if (host.getAttribute("label")) {
        const label = element("label", "field-label", host.getAttribute("label"));
        if (control) {
            control.id ||= `field-${++counter}`;
            label.htmlFor = control.id;
        }
        parts.push(label);
    }
    parts.push(...content);
    if (host.getAttribute("hint")) parts.push(element("span", "field-hint", host.getAttribute("hint")));
    host.replaceChildren(...parts);
    return ["field"];
});

defineElement("search", ["input-id", "placeholder", "aria-label"], (host) => {
    const input = host.querySelector("input") ?? element("input");
    input.type = "search";
    if (host.getAttribute("input-id")) input.id = host.getAttribute("input-id");
    input.placeholder = host.getAttribute("placeholder") ?? "";
    const label = host.getAttribute("aria-label");
    if (label) input.setAttribute("aria-label", label);
    host.replaceChildren(icon("search"), input);
    return ["searchbox"];
});

function make(name, attributes = {}, children = []) {
    const host = document.createElement(`kit-${name}`);
    for (const [key, value] of Object.entries(attributes)) if (value !== false && value != null) host.setAttribute(key, value === true ? "" : value);
    host.append(...children);
    host.render();
    return host;
}

components = { element, icon, extensionOf, formatSize, status, drawer, download, expand, menu, popover, closeOverlay: closeOpen, select, otp, resizable, carousel, calendar, chart, dataTable, scroller, questionnaire, make, refreshTexts };

}

{
const MAX = 6;
let counter = 0;

function attach(input, { suggestions, max = MAX, onEmpty = false }) {
    const id = `autocomplete-${++counter}`;
    const list = document.createElement("div");
    list.id = id;
    list.className = "autocomplete-list hidden";
    list.setAttribute("role", "listbox");
    document.body.appendChild(list);

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", id);
    input.setAttribute("aria-expanded", "false");
    input.autocomplete = "off";

    let options = [];
    let active = -1;

    const close = () => {
        list.classList.add("hidden");
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        active = -1;
    };

    const place = () => {
        const box = input.getBoundingClientRect();
        list.style.width = `${box.width}px`;
        list.style.top = `${box.bottom}px`;
        if (document.documentElement.dir === "rtl") {
            list.style.right = `${document.documentElement.clientWidth - box.right}px`;
            list.style.left = "auto";
        } else {
            list.style.left = `${box.left}px`;
            list.style.right = "auto";
        }
    };

    const mark = (index) => {
        active = index;
        options.forEach((option, i) => {
            option.classList.toggle("active", i === index);
            option.setAttribute("aria-selected", String(i === index));
        });
        if (index >= 0) input.setAttribute("aria-activedescendant", options[index].id);
        else input.removeAttribute("aria-activedescendant");
    };

    const pick = (text) => {
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        close();
    };

    const fit = (query) => {
        const lower = query.toLowerCase();
        const seen = new Set();
        const starts = [], holds = [];
        for (const text of suggestions(query)) {
            const key = String(text).toLowerCase();
            if (!key || seen.has(key) || key === lower) continue;
            seen.add(key);
            if (key.startsWith(lower)) starts.push(String(text));
            else if (key.includes(lower)) holds.push(String(text));
        }
        return [...starts, ...holds].slice(0, max);
    };

    const render = () => {
        const query = input.value.trim();
        const texts = query || onEmpty ? fit(query) : [];
        if (!texts.length) return close();
        list.replaceChildren();
        options = texts.map((text, i) => {
            const option = document.createElement("div");
            option.id = `${id}-${i}`;
            option.className = "autocomplete-option";
            option.setAttribute("role", "option");
            const at = text.toLowerCase().indexOf(query.toLowerCase());
            const match = document.createElement("span");
            match.className = "autocomplete-match";
            match.textContent = text.slice(at, at + query.length);
            option.append(text.slice(0, at), match, text.slice(at + query.length));
            option.addEventListener("mousedown", (event) => {
                event.preventDefault();
                pick(text);
            });
            option.addEventListener("mousemove", () => mark(i));
            list.appendChild(option);
            return option;
        });
        place();
        list.classList.remove("hidden");
        input.setAttribute("aria-expanded", "true");
        mark(-1);
    };

    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("blur", close);
    input.addEventListener("keydown", (event) => {
        if (list.classList.contains("hidden")) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            mark((active + 1) % options.length);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            mark(active <= 0 ? options.length - 1 : active - 1);
        } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            pick(options[active].textContent);
        } else if (event.key === "Escape") {
            event.stopPropagation();
            close();
        }
    });
    window.addEventListener("resize", () => !list.classList.contains("hidden") && place());
    window.addEventListener("scroll", close, true);
}

autocomplete = { attach };

}

{
const PAGE = new URL(`../../${authData.app}/`, import.meta.url).href;
const KEY = "account";
const PENDING = "account:pending";
const CALLBACK = new URL("callback.html", PAGE).href;
const OAUTH_TOKEN = /^gh[ou]_/;
const listeners = [];

try {
    const old = JSON.parse(localStorage.getItem(KEY));
    if (old && !OAUTH_TOKEN.test(old.token || "")) localStorage.removeItem(KEY);
} catch {}

const read = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        return saved && OAUTH_TOKEN.test(saved.token || "") && !(saved.expiresAt && saved.expiresAt <= Date.now()) ? saved : null;
    } catch {
        return null;
    }
};

const notify = () => listeners.forEach((listener) => listener(read()));

const fail = (code) => Object.assign(new Error(code), { code });

const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomString = (length) => base64url(crypto.getRandomValues(new Uint8Array(length)));
const challengeOf = async (verifier) => base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));

async function loadConfig() {
    const config = authData;
    const worker = location.hostname === "localhost" ? config.worker?.local : config.worker?.production;
    if (!config.clientId || !worker) throw fail("config");
    return { clientId: config.clientId, scope: config.scope || "", worker };
}

account = {
    get: read,

    async signInWithGitHub() {
        const config = await loadConfig();
        const state = randomString(24);
        const verifier = randomString(48);
        const challenge = await challengeOf(verifier);
        try {
            sessionStorage.setItem(PENDING, JSON.stringify({ state, verifier, returnTo: window.top.location.href, at: Date.now() }));
        } catch {
            throw fail("failed");
        }
        const url = new URL("https://github.com/login/oauth/authorize");
        url.search = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: CALLBACK,
            scope: config.scope,
            state,
            code_challenge: challenge,
            code_challenge_method: "S256",
        });
        window.top.location.assign(url.href);
    },

    async finishSignIn({ code, state }) {
        let pending = null;
        try {
            pending = JSON.parse(sessionStorage.getItem(PENDING));
            sessionStorage.removeItem(PENDING);
        } catch {}
        if (!pending || !code || !state || state !== pending.state || Date.now() - pending.at > 10 * 60 * 1000) throw fail("state");
        const config = await loadConfig();
        let response;
        try {
            response = await fetch(`${config.worker}/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, redirect_uri: CALLBACK, code_verifier: pending.verifier }),
            });
        } catch {
            throw fail("failed");
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.access_token) throw fail(data.error === "bad_verification_code" ? "state" : "exchange");
        let user;
        try {
            const profile = await fetch("https://api.github.com/user", {
                headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/vnd.github+json" },
            });
            if (!profile.ok) throw new Error("profile");
            user = await profile.json();
        } catch {
            throw fail("failed");
        }
        this.set({
            token: data.access_token,
            login: user.login,
            name: user.name || user.login,
            avatar: user.avatar_url,
            ...(data.expires_in ? { expiresAt: Date.now() + data.expires_in * 1000 } : {}),
        });
        return pending.returnTo || "";
    },

    set(info) {
        try {
            localStorage.setItem(KEY, JSON.stringify(info));
        } catch {}
        notify();
    },

    signOut() {
        const saved = read();
        try {
            localStorage.removeItem(KEY);
        } catch {}
        notify();
        if (saved) {
            loadConfig()
                .then((config) => fetch(`${config.worker}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: saved.token }), keepalive: true }))
                .catch(() => {});
        }
    },

    open(page = "", app = location.pathname.split("/").filter(Boolean)[0] || "") {
        const url = new URL(PAGE);
        if (page) url.searchParams.set("page", page);
        if (app) url.searchParams.set("app", app);
        let dialog = document.querySelector("dialog.account-dialog");
        if (!dialog) {
            const frame = document.createElement("iframe");
            frame.src = url.href;
            dialog = document.createElement("dialog");
            dialog.className = "account-dialog";
            dialog.append(frame);
            dialog.addEventListener("click", (event) => {
                if (event.target === dialog) dialog.close();
            });
            window.addEventListener("message", (event) => {
                if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
                if (event.data?.type === "account:close") dialog.close();
            });
            document.body.append(dialog);
        }
        const frame = dialog.querySelector("iframe");
        if (frame.src !== url.href) frame.src = url.href;
        dialog.showModal();
        frame.contentWindow?.postMessage({ type: "account:focus" }, location.origin);
    },

    bind(button) {
        const render = (user) => {
            button.classList.toggle("signed-in", !!user);
            button.style.backgroundImage = user ? `url("${user.avatar}")` : "";
        };
        button.addEventListener("click", () => this.open("settings"));
        this.onChange(render);
        render(read());
    },

    onChange(fn) {
        listeners.push(fn);
    },
};

window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) notify();
});


}

{
const LIMIT = 64 * 1024 * 1024;
const KEPT = 8;
const ready = new Map();
const reading = new Set();

const prepare = (source, done) => {
    if (reading.has(source.id) || source.size > LIMIT) return;
    reading.add(source.id);
    Promise.resolve(source.load())
        .then((blob) => {
            ready.set(source.id, URL.createObjectURL(blob));
            while (ready.size > KEPT) {
                const [oldest, url] = ready.entries().next().value;
                ready.delete(oldest);
                URL.revokeObjectURL(url);
            }
            done();
        })
        .catch(() => {})
        .finally(() => reading.delete(source.id));
};

const tell = (message) => { if (window.parent !== window) window.parent.postMessage({ type: "app:drag", ...message }, location.origin); };

transfer = {
    dragging: false,

    drag(element, source, region) {
        const current = () => (typeof source === "function" ? source() : source);
        let handle = null;
        const sync = () => {
            const dragged = current();
            element.draggable = !!dragged && !dragged.image;
            if (!dragged || !dragged.image) { handle?.remove(); handle = null; if (dragged && !ready.has(dragged.id)) prepare(dragged, () => {}); return; }
            const host = (region && region()) || element;
            if (!handle || handle.parentNode !== host) {
                handle?.remove();
                handle = new Image();
                handle.alt = "";
                handle.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;z-index:1;";
                if (getComputedStyle(host).position === "static") host.style.position = "relative";
                host.prepend(handle);
                handle.addEventListener("dragstart", (event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setDragImage(host, event.offsetX, event.offsetY);
                    transfer.dragging = true;
                });
                handle.addEventListener("dragend", () => { transfer.dragging = false; });
            }
            if (handle.dataset.id !== dragged.id) { handle.dataset.id = dragged.id; handle.removeAttribute("src"); handle.style.pointerEvents = "none"; }
            const url = ready.get(dragged.id);
            if (url) { if (handle.getAttribute("src") !== url) handle.src = url; handle.style.pointerEvents = "auto"; }
            else prepare(dragged, sync);
        };
        for (const type of ["pointerenter", "pointermove", "focus"]) element.addEventListener(type, sync);
        element.addEventListener("dragstart", (event) => {
            const dragged = current();
            if (event.target !== element || !dragged || dragged.image) return;
            const url = ready.get(dragged.id);
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("text/plain", dragged.name);
            if (url) event.dataTransfer.setData("text/uri-list", `${url}#${encodeURIComponent(dragged.name)}`);
            transfer.dragging = true;
            if (url) tell({ on: true, url, name: dragged.name });
        });
        element.addEventListener("dragend", () => { transfer.dragging = false; tell({ on: false }); });
    },

    take(event) {
        const data = event.dataTransfer;
        const files = [...data.files];
        const link = data.getData("text/uri-list").split("\n").find((line) => line && !line.startsWith("#")) || "";
        if (files.length || !link.startsWith(`blob:${location.origin}/`)) return Promise.resolve(files);
        const name = decodeURIComponent(link.split("#")[1] || "file");
        return fetch(link).then((response) => response.blob()).then((blob) => [new File([blob], name, { type: blob.type })]).catch(() => []);
    },
};

}

{
const key = (app) => `${app}.settings`;

const read = (app) => {
    try {
        return JSON.parse(localStorage.getItem(key(app))) || {};
    } catch {
        return {};
    }
};

settings = {
    get: (app, defaults = {}) => ({ ...defaults, ...read(app) }),

    onChange(app, defaults, fn) {
        window.addEventListener("storage", (event) => {
            if (event.key === key(app) || event.key === null) fn(this.get(app, defaults));
        });
    },

    listen(app, fn) {
        const channel = new BroadcastChannel(`kancamu-${app}`);
        channel.onmessage = (event) => fn(event.data);
    },

    set(app, values) {
        try {
            localStorage.setItem(key(app), JSON.stringify(values));
        } catch {}
        window.dispatchEvent(new CustomEvent("app:settings", { detail: { app } }));
    },
    reset(app) {
        try {
            localStorage.removeItem(key(app));
        } catch {}
        window.dispatchEvent(new CustomEvent("app:settings", { detail: { app } }));
    },
    announce(app, message) {
        const channel = new BroadcastChannel(`kancamu-${app}`);
        channel.postMessage(message);
        channel.close();
    },
};

}

{
const API = "https://api.github.com";
const APPS = "AppData";
const SYSTEM = [APPS, "README.md"];
const TRIES = 4;

const fail = (code, message = code) => Object.assign(new Error(message), { code });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const encode = (path) => path.split("/").map(encodeURIComponent).join("/");

async function call(store, path, options = {}) {
    const response = await fetch(path.startsWith("http") ? path : API + path, {
        cache: "no-store",
        ...options,
        headers: {
            Authorization: `Bearer ${store.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(typeof options.body === "string" ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {}),
        },
    });
    if (!response.ok) {
        let message = response.statusText;
        try {
            message = (await response.json()).message || message;
        } catch {}
        throw Object.assign(new Error(message), { status: response.status });
    }
    return response;
}

const json = async (store, path, options) => (await call(store, path, options)).json();

const bytesToBase64 = (bytes) => {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
};
const toBase64 = (text) => bytesToBase64(new TextEncoder().encode(text));

const inRepo = (store, path) => [store.root, path].filter(Boolean).join("/").replace(/\/+$/, "");
const contentsUrl = (store, path) => {
    const full = inRepo(store, path);
    return `/repos/${store.owner}/${store.repo}/contents${full ? `/${encode(full)}` : ""}`;
};

async function again(task) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await task();
        } catch (error) {
            if (error.status !== 409 || attempt >= TRIES) throw error;
            await wait(300 * attempt);
        }
    }
}

storage = {
    connect(app) {
        return storage.open(app, `${APPS}/${app}`);
    },

    async drive() {
        const store = await storage.open(driveData.app, "");
        store.system = SYSTEM;
        store.own = `${APPS}/${driveData.app}`;
        return store;
    },

    async open(app, root) {
        const signedIn = account.get();
        if (!signedIn) throw fail("signedOut");
        const brand = brandData;
        const store = { token: signedIn.token, owner: signedIn.login, repo: `${brand.id}-data`, app, root };

        try {
            store.info = await json(store, `/repos/${store.owner}/${store.repo}`);
        } catch (error) {
            if (error.status !== 404) throw error;
            try {
                store.info = await json(store, "/user/repos", {
                    method: "POST",
                    body: JSON.stringify({ name: store.repo, private: true, description: `${brand.name} data` }),
                });
                await wait(1500);
            } catch (create) {
                if (create.status !== 422) throw create;
                store.info = await json(store, `/repos/${store.owner}/${store.repo}`);
            }
        }
        if (!store.info.permissions?.push) throw fail("noWrite");
        store.branch = store.info.default_branch || "main";

        await storage.ensureBranch(store);
        return store;
    },

    async ensureBranch(store) {
        try {
            await call(store, `/repos/${store.owner}/${store.repo}/git/ref/heads/${encodeURIComponent(store.branch)}`);
        } catch (error) {
            if (error.status !== 404 && error.status !== 409) throw error;
            try {
                await call(store, `/repos/${store.owner}/${store.repo}/contents/${APPS}/.gitkeep`, { method: "PUT", body: JSON.stringify({ message: "Initialize", content: "" }) });
            } catch (put) {
                if (put.status !== 422 && put.status !== 409) throw put;
            }
        }
    },

    async readFile(store, path) {
        try {
            const response = await call(store, `${contentsUrl(store, path)}?ref=${encodeURIComponent(store.branch)}`, {
                headers: { Accept: "application/vnd.github.raw+json" },
            });
            return await response.text();
        } catch (error) {
            if (error.status === 404) return null;
            throw error;
        }
    },

    async list(store, folder) {
        try {
            const items = await json(store, `${contentsUrl(store, folder)}?ref=${encodeURIComponent(store.branch)}`);
            return Array.isArray(items) ? items.filter((item) => item.type === "file").map(({ name, sha }) => ({ name, sha })) : [];
        } catch (error) {
            if (error.status === 404) return [];
            throw error;
        }
    },

    async tree(store) {
        const base = `/repos/${store.owner}/${store.repo}/git/trees`;
        if (!store.root) {
            const whole = await json(store, `${base}/${encodeURIComponent(store.branch)}?recursive=1`);
            return { files: whole.tree.filter((item) => item.type === "blob").map(({ path, size }) => ({ path, size })), truncated: !!whole.truncated };
        }
        let sha = encodeURIComponent(store.branch);
        for (const name of store.root.split("/")) {
            const level = await json(store, `${base}/${sha}`);
            const next = level.tree.find((item) => item.type === "tree" && item.path === name);
            if (!next) return { files: [], truncated: false };
            sha = next.sha;
        }
        const tree = await json(store, `${base}/${sha}?recursive=1`);
        return { files: tree.tree.filter((item) => item.type === "blob").map(({ path, size }) => ({ path, size })), truncated: !!tree.truncated };
    },

    async readBinary(store, path) {
        try {
            const response = await call(store, `${contentsUrl(store, path)}?ref=${encodeURIComponent(store.branch)}`, {
                headers: { Accept: "application/vnd.github.raw+json" },
            });
            return new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            if (error.status === 404) return null;
            throw error;
        }
    },

    async writeFile(store, path, text, message = `${store.app}: save ${path}`) {
        return storage.put(store, path, toBase64(text), message);
    },

    async writeBinary(store, path, bytes, message = `${store.app}: save ${path}`) {
        return storage.put(store, path, bytesToBase64(bytes), message);
    },

    async put(store, path, content, message) {
        const url = contentsUrl(store, path);
        return again(async () => {
            let sha;
            try {
                sha = (await json(store, `${url}?ref=${encodeURIComponent(store.branch)}`)).sha;
            } catch (error) {
                if (error.status !== 404) throw error;
            }
            const saved = await json(store, url, { method: "PUT", body: JSON.stringify({ message, content, branch: store.branch, ...(sha ? { sha } : {}) }) });
            return saved.content.sha;
        });
    },

    async removeFile(store, path, message = `${store.app}: delete ${path}`) {
        const url = contentsUrl(store, path);
        await again(async () => {
            let sha;
            try {
                sha = (await json(store, `${url}?ref=${encodeURIComponent(store.branch)}`)).sha;
            } catch (error) {
                if (error.status === 404) return;
                throw error;
            }
            await call(store, url, { method: "DELETE", body: JSON.stringify({ message, sha, branch: store.branch }) });
        });
    },
};

}
