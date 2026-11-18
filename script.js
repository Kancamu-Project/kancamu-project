const FALLBACK_LANG = "en-US";

const state = {
    lang: null,
    languages: [],
    siteName: {},
    siteHighlight: null,
    siteColor: null,
    ui: {},
    categories: {},
    projects: [],
    category: "all",
    publisher: "all",
    sort: "asc",
    query: "",
    view: "grid",
};

function saveFilters() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.category !== "all") params.set("category", state.category);
    if (state.publisher !== "all") params.set("publisher", state.publisher);
    if (state.sort !== "asc") params.set("sort", state.sort);
    if (state.view !== "grid") params.set("view", state.view);
    const search = params.toString();
    history.replaceState(null, "", location.pathname + (search ? `?${search}` : "") + location.hash);
    syncControls();
}

function restoreFilters() {
    const params = new URLSearchParams(location.search);
    const category = params.get("category");
    if (category && state.categories[category]) state.category = category;
    state.publisher = params.get("publisher") || "all";
    if (["asc", "desc"].includes(params.get("sort"))) state.sort = params.get("sort");
    state.query = params.get("q") || "";
    if (["grid", "list"].includes(params.get("view"))) state.view = params.get("view");
}

function syncControls() {
    document.getElementById("reset").hidden =
        !state.query && state.category === "all" && state.publisher === "all";
    document.getElementById("search").value = state.query;
    document.getElementById("sort").value = state.sort;
    document.querySelectorAll("#view-toggle button").forEach((button) =>
        button.classList.toggle("active", button.dataset.view === state.view)
    );
}

function findSameBase(codes, lang) {
    const base = lang.split("-")[0];
    return codes.find((code) => code.split("-")[0] === base);
}

function pickText(texts) {
    const lang = state.lang || navigator.language;
    const sameBase = findSameBase(Object.keys(texts), lang);
    return texts[lang] || texts[sameBase] || texts[FALLBACK_LANG] || Object.values(texts)[0] || "";
}

function resolveLanguage() {
    const codes = state.languages.map((language) => language.code);
    let saved = null;
    try {
        saved = localStorage.getItem("lang");
    } catch {}
    if (codes.includes(saved)) return saved;
    return codes.includes(navigator.language)
        ? navigator.language
        : findSameBase(codes, navigator.language) || FALLBACK_LANG;
}

function renderLanguageSelect() {
    const select = document.getElementById("language");
    select.replaceChildren(
        ...state.languages.map((language) => {
            const option = createElement("option", "", language.name);
            option.value = language.code;
            return option;
        })
    );
    select.value = state.lang;
}

function renderAll() {
    const language = state.languages.find((item) => item.code === state.lang);
    document.documentElement.lang = state.lang;
    document.documentElement.dir = language?.dir || "ltr";

    const siteName = pickText(state.siteName);
    document.title = siteName;
    const siteElement = document.getElementById("site-name");
    siteElement.style.setProperty("--color", state.siteColor);
    siteElement.replaceChildren(
        ...createNameElement(
            siteName,
            state.siteHighlight && pickText(state.siteHighlight)
        ).childNodes
    );

    applyUi();
    renderPublisherSelect();
    renderCategoryFilter();
    renderProjects();
}

function t(key, params = {}) {
    const text = state.ui[key] ? pickText(state.ui[key]) : key;
    return text.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
}

function applyUi() {
    document.querySelectorAll("[data-i18n]").forEach((element) => {
        element.textContent = t(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-title]").forEach((element) => {
        element.title = t(element.dataset.i18nTitle);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
        element.placeholder = t(element.dataset.i18nPlaceholder);
    });
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function createButton(className, text) {
    const button = createElement("button", className);
    button.appendChild(createElement("span", "", text));
    return button;
}

function createGlyph(name) {
    return createElement("div", `glyph ${name}`);
}

let openMenu = null;

function closeMenu() {
    openMenu?.remove();
    openMenu = null;
}

function showMenu(anchor, project) {
    const menu = createElement("div", "menu");
    menu.owner = anchor;

    const copy = createButton("item", t("copyLink"));
    copy.addEventListener("click", async () => {
        let message;
        try {
            await navigator.clipboard.writeText(project.url);
            message = t("copied");
        } catch {
            message = t("copyFailed");
        }
        copy.firstChild.textContent = message;
        setTimeout(closeMenu, 800);
    });

    const here = createButton("item", t("openHere"));
    here.addEventListener("click", () => {
        window.location.href = project.url;
    });

    menu.append(copy, here);
    document.body.appendChild(menu);

    const rect = anchor.getBoundingClientRect();
    const fitsBelow = rect.bottom + menu.offsetHeight < window.innerHeight;
    menu.style.top = `${fitsBelow ? rect.bottom + 2 : rect.top - menu.offsetHeight - 2}px`;
    menu.style.left = `${Math.max(0, rect.right - menu.offsetWidth)}px`;
    openMenu = menu;
}

document.addEventListener("click", (event) => {
    if (openMenu && !openMenu.contains(event.target)) closeMenu();
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
});
window.addEventListener("resize", closeMenu);
document.addEventListener("scroll", closeMenu, true);

function createProjectCard(project) {
    const name = pickText(project.name);
    const card = createElement("div", "project");
    card.style.setProperty("--color", project.color);

    const top = createElement("div", "top");
    const link = createElement("a", "link");
    link.href = project.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.append(createElement("span", "", t("website")), createGlyph("external"));
    top.append(createElement("span", "tag", project.publisher || ""), link);

    const icon = createElement("div", "icon");
    icon.style.backgroundImage = `url(${JSON.stringify(project.icon)})`;

    const text = createElement("div", "text");
    text.append(
        createNameElement(name, project.highlight && pickText(project.highlight)),
        createElement("span", "description", pickText(project.description))
    );
    const info = createElement("div", "info");
    info.append(icon, text);

    const open = createButton("open", t("open"));
    open.addEventListener("click", () => window.open(project.url, "_blank", "noopener"));

    const more = createElement("button", "more");
    more.title = t("more");
    more.appendChild(createGlyph("more"));
    more.addEventListener("click", (event) => {
        event.stopPropagation();
        const wasOpenHere = openMenu?.owner === more;
        closeMenu();
        if (!wasOpenHere) showMenu(more, project);
    });

    const actions = createElement("div", "actions");
    actions.append(open, more);

    const categories = createElement("div", "categories");
    categories.append(
        ...(project.categories || []).map((key) =>
            createElement("span", "category", categoryLabel(key))
        )
    );

    card.append(top, info, categories, actions);
    return card;
}

function createNameElement(name, highlight) {
    const element = createElement("span", "name");
    const index = highlight ? name.indexOf(highlight) : -1;
    if (index === -1) {
        element.textContent = name;
        return element;
    }
    element.append(
        name.slice(0, index),
        createElement("span", "highlight", highlight),
        name.slice(index + highlight.length)
    );
    return element;
}

function categoryLabel(key) {
    return state.categories[key] ? pickText(state.categories[key]) : key;
}

function renderPublisherSelect() {
    const select = document.getElementById("publisher");
    const publishers = [...new Set(state.projects.map((project) => project.publisher).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, state.lang));
    const options = [["all", t("allPublishers")], ...publishers.map((name) => [name, name])];
    select.replaceChildren(
        ...options.map(([value, label]) => {
            const option = createElement("option", "", label);
            option.value = value;
            return option;
        })
    );
    if (!publishers.includes(state.publisher)) state.publisher = "all";
    select.value = state.publisher;
}

function renderCategoryFilter() {
    const filter = document.getElementById("category-filter");
    const sorted = Object.keys(state.categories).sort((a, b) =>
        categoryLabel(a).localeCompare(categoryLabel(b), state.lang)
    );
    const keys = ["all", ...sorted];
    filter.replaceChildren(
        ...keys.map((key) => {
            const button = createButton(
                key === state.category ? "active" : "",
                key === "all" ? t("all") : categoryLabel(key)
            );
            button.addEventListener("click", () => {
                state.category = key;
                saveFilters();
                renderCategoryFilter();
                renderProjects();
            });
            return button;
        })
    );
}

function renderProjects() {
    const list = document.getElementById("project-list");
    list.className = state.view;

    const query = state.query.trim().toLowerCase();
    const direction = state.sort === "asc" ? 1 : -1;
    const projects = state.projects
        .filter((project) =>
            state.category === "all" || (project.categories || []).includes(state.category)
        )
        .filter((project) =>
            state.publisher === "all" || project.publisher === state.publisher
        )
        .filter((project) =>
            `${pickText(project.name)} ${pickText(project.description)}`.toLowerCase().includes(query)
        )
        .sort((a, b) => direction * pickText(a.name).localeCompare(pickText(b.name)));

    if (projects.length === 0) {
        list.replaceChildren(createElement("span", "empty", t("empty")));
        return;
    }
    const items = projects.map(createProjectCard);
    if (state.view === "list") items.unshift(createListHeader());
    list.replaceChildren(...items);
}

function createListHeader() {
    const header = createElement("div", "list-header");
    header.append(
        createElement("span", "", t("project")),
        createElement("span", "publisher", t("publisher")),
        createElement("span", "category", t("category"))
    );
    return header;
}

async function loadData() {
    const response = await fetch("data.json", { cache: "no-store" });
    const data = await response.json();

    state.siteName = data.name;
    state.siteHighlight = data.highlight;
    state.siteColor = data.color;
    document.getElementById("site-logo").style.backgroundImage = `url(${JSON.stringify(data.icon)})`;
    state.languages = data.languages;
    state.ui = data.ui;
    state.categories = data.categories;
    state.projects = data.projects;
    state.lang = resolveLanguage();
    restoreFilters();
    renderLanguageSelect();
    renderAll();
    syncControls();
}

function load() {
    loadData().catch((error) => {
        console.error(error);
        document.getElementById("project-list").replaceChildren(
            createElement("span", "empty", t("errorLoad"))
        );
    });
}

document.getElementById("language").addEventListener("change", (event) => {
    state.lang = event.target.value;
    try {
        localStorage.setItem("lang", state.lang);
    } catch {}
    closeMenu();
    renderAll();
});

document.getElementById("theme").addEventListener("click", () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    try {
        localStorage.setItem("theme", root.dataset.theme);
    } catch {}
});

document.getElementById("publisher").addEventListener("change", (event) => {
    state.publisher = event.target.value;
    saveFilters();
    renderProjects();
});

document.getElementById("sort").addEventListener("change", (event) => {
    state.sort = event.target.value;
    saveFilters();
    renderProjects();
});

document.getElementById("search").addEventListener("input", (event) => {
    state.query = event.target.value;
    saveFilters();
    renderProjects();
});

document.getElementById("reset").addEventListener("click", () => {
    state.query = "";
    state.category = "all";
    state.publisher = "all";
    saveFilters();
    document.getElementById("search").value = "";
    document.getElementById("publisher").value = "all";
    renderCategoryFilter();
    renderProjects();
});

document.querySelectorAll("#view-toggle button").forEach((button) => {
    button.addEventListener("click", () => {
        state.view = button.dataset.view;
        saveFilters();
        document.querySelectorAll("#view-toggle button").forEach((other) =>
            other.classList.toggle("active", other === button)
        );
        renderProjects();
    });
});

load();
