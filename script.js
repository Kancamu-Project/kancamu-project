const state = {
    home: null,
    categories: {},
    projects: [],
    category: "all",
    publisher: "all",
    sort: "asc",
    query: "",
    view: "grid",
    tabs: [],
    active: null,
};

function saveFilters() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.category !== "all") params.set("category", state.category);
    if (state.publisher !== "all") params.set("publisher", state.publisher);
    if (state.sort !== "asc") params.set("sort", state.sort);
    if (state.view !== "grid") params.set("view", state.view);
    if (state.tabs.length) params.set("tabs", state.tabs.join(","));
    if (state.active !== state.home) params.set("tab", state.active);
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

    const known = state.projects.map((project) => project.id);
    state.tabs = [...new Set((params.get("tabs") || "").split(","))].filter(
        (id) => known.includes(id) && id !== state.home
    );
    const active = params.get("tab");
    state.active = allTabs().includes(active) ? active : state.home;
}

// The first tab is this site itself: it is always open and cannot be closed.
function allTabs() {
    return [state.home, ...state.tabs];
}

function findProject(id) {
    return state.projects.find((project) => project.id === id);
}

function openTab(id) {
    if (!allTabs().includes(id)) state.tabs.push(id);
    selectTab(id);
}

function selectTab(id) {
    state.active = id;
    saveFilters();
    renderTabs();
    syncViewer();
}

function closeTab(id) {
    const index = state.tabs.indexOf(id);
    if (index === -1) return;
    state.tabs.splice(index, 1);
    if (state.active === id) state.active = allTabs()[index];
    saveFilters();
    renderTabs();
    syncViewer();
}

function renderTabs() {
    const tabs = document.getElementById("tabs");

    tabs.replaceChildren(
        ...allTabs().map(findProject).filter(Boolean).map((project) => {
            const tab = createElement("div", "tab");
            tab.style.setProperty("--color", projectColor(project));
            tab.classList.toggle("active", state.active === project.id);

            const select = createElement("button", "select");
            select.title = pickText(project.name);
            const icon = createElement("div", "icon");
            icon.style.backgroundImage = `url(${JSON.stringify(project.icon)})`;
            select.append(
                icon,
                createNameElement(pickText(project.name), project.highlight && pickText(project.highlight))
            );
            select.addEventListener("click", () => selectTab(project.id));
            select.addEventListener("auxclick", (event) => {
                if (event.button === 1) closeTab(project.id);
            });

            tab.appendChild(select);
            if (state.tabs.includes(project.id)) {
                const close = createElement("button", "close");
                close.title = t("close");
                close.appendChild(createGlyph("close"));
                close.addEventListener("click", () => closeTab(project.id));
                tab.appendChild(close);
            }
            return tab;
        })
    );
    tabs.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    updateTabFade();
}

function syncViewer() {
    const viewer = document.getElementById("viewer");
    const onHome = state.active === state.home;
    viewer.hidden = onHome;
    document.getElementById("main").hidden = !onHome;
    document.getElementById("footer").hidden = !onHome;

    viewer.querySelectorAll("iframe").forEach((frame) => {
        if (!state.tabs.includes(frame.dataset.id)) frame.remove();
    });
    state.tabs.forEach((id) => {
        const project = findProject(id);
        if (!project) return;
        let frame = viewer.querySelector(`iframe[data-id="${id}"]`);
        if (!frame) {
            frame = createElement("iframe");
            frame.dataset.id = id;
            frame.src = project.url;
            frame.allow = "fullscreen; clipboard-write";
            viewer.appendChild(frame);
        }
        frame.title = pickText(project.name);
        frame.hidden = id !== state.active;
    });
}

function syncControls() {
    document.getElementById("reset-button").hidden =
        !state.query && state.category === "all" && state.publisher === "all";
    document.getElementById("project-search").value = state.query;
    document.getElementById("sort-order").value = state.sort;
    document.querySelectorAll("#view-toggle button").forEach((button) =>
        button.classList.toggle("active", button.dataset.view === state.view)
    );
}

const pickText = (texts) => i18n.pick(texts);
const t = (key, params) => i18n.t(key, params);

function renderAll() {
    i18n.apply();
    renderTabs();
    renderPublisherSelect();
    renderCategoryFilter();
    renderProjects();
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

    const copy = createButton("menu-item", t("copyLink"));
    copy.addEventListener("click", async () => {
        let message;
        try {
            await navigator.clipboard.writeText(new URL(project.url, location.href).href);
            message = t("copied");
        } catch {
            message = t("copyFailed");
        }
        copy.firstChild.textContent = message;
        setTimeout(closeMenu, 800);
    });

    const here = createButton("menu-item", t("openNew"));
    here.addEventListener("click", () => {
        window.open(project.url, "_blank", "noopener");
        closeMenu();
    });

    menu.append(copy, here);
    document.body.appendChild(menu);
    copy.focus();
    // Keyboard in the menu: arrows move, Escape closes and gives the focus back, Tab leaves.
    menu.addEventListener("keydown", (event) => {
        const buttons = [...menu.querySelectorAll("button")], i = buttons.indexOf(document.activeElement);
        if (event.key === "ArrowDown") {
            event.preventDefault();
            buttons[(i + 1) % buttons.length].focus();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            buttons[(i - 1 + buttons.length) % buttons.length].focus();
        } else if (event.key === "Escape") {
            event.stopPropagation();
            closeMenu();
            anchor.focus();
        } else if (event.key === "Tab") closeMenu();
    });

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
    card.style.setProperty("--color", projectColor(project));

    const top = createElement("div", "project-header");
    const link = createElement("a", "project-link");
    link.href = project.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.append(createElement("span", "", project.id), createGlyph("external"));
    top.append(createElement("span", "project-publisher", project.publisher || ""), link);

    const icon = createElement("div", "icon");
    icon.style.backgroundImage = `url(${JSON.stringify(project.icon)})`;

    const text = createElement("div", "project-text");
    text.append(
        createNameElement(name, project.highlight && pickText(project.highlight)),
        createElement("span", "description", pickText(project.description))
    );
    const info = createElement("div", "project-body");
    info.append(icon, text);

    const open = createButton("project-open-button", t("open"));
    open.addEventListener("click", () => openTab(project.id));

    const more = createElement("button", "project-more-button");
    more.title = t("more");
    more.appendChild(createGlyph("more"));
    more.addEventListener("click", (event) => {
        event.stopPropagation();
        const wasOpenHere = openMenu?.owner === more;
        closeMenu();
        if (!wasOpenHere) showMenu(more, project);
    });

    const actions = createElement("div", "project-actions");
    actions.append(open, more);

    const categories = createElement("div", "project-categories");
    categories.append(
        ...(project.categories || []).map((key) =>
            createElement("span", "category", categoryLabel(key))
        )
    );

    card.append(top, info, categories, actions);
    return card;
}

// A palette name ("blue") or, for projects made by others, their own colour ("#a78bfa").
function projectColor(project) {
    return project.color.startsWith("#") ? project.color : `var(--${project.color})`;
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
    const select = document.getElementById("publisher-filter");
    const publishers = [...new Set(state.projects.map((project) => project.publisher).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, i18n.lang));
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
        categoryLabel(a).localeCompare(categoryLabel(b), i18n.lang)
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
    const data = await i18n.load();

    state.home = data.home;
    state.categories = data.categories;
    state.projects = data.projects;
    restoreFilters();
    i18n.selects();
    renderAll();
    syncControls();
    syncViewer();
}

function load() {
    loadData().catch((error) => {
        console.error(error);
        document.getElementById("project-list").replaceChildren(
            createElement("span", "empty", t("errorLoad"))
        );
    });
}

// Darken the edge of the tab bar where more tabs are hidden.
function updateTabFade() {
    const tabs = document.getElementById("tabs");
    const offset = Math.abs(tabs.scrollLeft);
    tabs.classList.toggle("fade-start", offset > 1);
    tabs.classList.toggle("fade-end", offset + tabs.clientWidth < tabs.scrollWidth - 1);
}

document.getElementById("tabs").addEventListener("scroll", updateTabFade);
window.addEventListener("resize", updateTabFade);

// Let a plain mouse wheel scroll the tab bar sideways.
document.getElementById("tabs").addEventListener(
    "wheel",
    (event) => {
        const tabs = event.currentTarget;
        if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
        event.preventDefault();
        tabs.scrollLeft += event.deltaY;
    },
    { passive: false }
);

i18n.onChange(() => {
    closeMenu();
    renderAll();
});

document.getElementById("theme-button").addEventListener("click", () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    try {
        localStorage.setItem("theme", root.dataset.theme);
    } catch {}
});

// Account: the sign-in is the account web, opened by assets/account.js.
account.bind(document.getElementById("account-button"));

document.getElementById("publisher-filter").addEventListener("change", (event) => {
    state.publisher = event.target.value;
    saveFilters();
    renderProjects();
});

document.getElementById("sort-order").addEventListener("change", (event) => {
    state.sort = event.target.value;
    saveFilters();
    renderProjects();
});

autocomplete.attach(document.getElementById("project-search"), {
    suggestions: () => state.projects.map((project) => pickText(project.name)),
});
document.getElementById("project-search").addEventListener("input", (event) => {
    state.query = event.target.value;
    saveFilters();
    renderProjects();
});

document.getElementById("reset-button").addEventListener("click", () => {
    state.query = "";
    state.category = "all";
    state.publisher = "all";
    saveFilters();
    document.getElementById("project-search").value = "";
    document.getElementById("publisher-filter").value = "all";
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
