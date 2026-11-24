const state = {
    iconSprite: null,   // the icons of the apps of the brand in one file (data.js, "iconSprite"; assets/tools/sprites.mjs makes it)
    home: null,
    categories: {},
    projects: [],
    category: "all",
    publisher: "all",
    alternative: "all",   // a product that a project is an alternative to (Microsoft Word)
    sort: "asc",
    query: "",
    view: "grid",
    tabs: [],
    active: null,
    page: "",   // "about" or "terms" (data.js, "pages"): shown in the main instead of the directory
    frames: {},   // the query string of the app in each open tab (what the app says about itself, assets/js/url.js): id -> "path=Images&view=list"
};

function saveFilters() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.category !== "all") params.set("category", state.category);
    if (state.publisher !== "all") params.set("publisher", state.publisher);
    if (state.alternative !== "all") params.set("alternative", state.alternative);
    if (state.sort !== "asc") params.set("sort", state.sort);
    if (state.view !== "grid") params.set("view", state.view);
    if (state.tabs.length) params.set("tabs", state.tabs.join(","));
    if (state.page) params.set("page", state.page);
    if (state.active !== state.home) params.set("tab", state.active);
    for (const id of state.tabs) if (state.frames[id]) params.set(`s.${id}`, state.frames[id]);   // a reload opens every app as it was
    const search = params.toString();
    history.replaceState(null, "", location.pathname + (search ? `?${search}` : "") + location.hash);
    syncControls();
}

function restoreFilters() {
    const params = new URLSearchParams(location.search);
    const category = params.get("category");
    if (category && state.categories[category]) state.category = category;
    state.publisher = params.get("publisher") || "all";
    state.alternative = params.get("alternative") || "all";
    if (["asc", "desc"].includes(params.get("sort"))) state.sort = params.get("sort");
    state.query = params.get("q") || "";
    if (["grid", "list"].includes(params.get("view"))) state.view = params.get("view");

    const known = state.projects.map((project) => project.id);
    state.tabs = [...new Set((params.get("tabs") || "").split(","))].filter(
        (id) => known.includes(id) && id !== state.home
    );
    for (const id of state.tabs) if (params.get(`s.${id}`)) state.frames[id] = params.get(`s.${id}`);
    state.page = Object.keys(i18n.data.pages).includes(params.get("page")) ? params.get("page") : "";
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
            tab.dataset.id = project.id;
            tab.classList.toggle("home", project.id === state.home);
            tab.style.setProperty("--color", projectColor(project));
            tab.classList.toggle("active", state.active === project.id);

            const select = createElement("button", "select");
            select.title = pickText(project.name);
            const icon = createElement("div", "app-icon");
            setIcon(icon, project);
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
    const home = tabs.querySelector(".tab.home");
    tabs.parentElement.style.setProperty("--home-width", `${home ? home.offsetWidth : 0}px`);   // the Kancamu tab is pinned: the fade and the scrolling start after it
    tabs.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    updateTabFade();
}

// A tab is dragged to a new place (the Kancamu tab is not moved, and nothing goes before it). The order is kept in the address.
// A pointer is used, so it also works by touch. A click that ends a drag is not taken as a click.
let drag = null, justDragged = false;
function tabsOf(strip) {
    return [...strip.children];
}
document.getElementById("tabs").addEventListener("pointerdown", (event) => {
    const tab = event.target.closest(".tab");
    if (!tab || tab.classList.contains("home") || event.button !== 0 || event.target.closest(".close")) return;
    const strip = event.currentTarget;
    tab.style.transform = "";
    drag = { tab, strip, startX: event.clientX, initialLeft: tab.getBoundingClientRect().left, active: false, pointer: event.pointerId };
});
document.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { tab, strip } = drag;
    const moved = event.clientX - drag.startX;
    if (!drag.active) {
        if (Math.abs(moved) < 6) return;
        drag.active = true;
        tab.classList.add("dragging");
        try { tab.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    }
    const direction = document.documentElement.dir === "rtl" ? -1 : 1;
    const naturalLeft = () => {   // where the tab would be without the move that follows the pointer
        const kept = tab.style.transform;
        tab.style.transform = "";
        const left = tab.getBoundingClientRect().left;
        tab.style.transform = kept;
        return left;
    };
    const place = () => { tab.style.transform = `translateX(${event.clientX - drag.startX - (naturalLeft() - drag.initialLeft)}px)`; };
    place();
    // the tab passes the middle of its neighbour: they change places
    for (let guard = 0; guard < 50; guard++) {
        const box = tab.getBoundingClientRect();
        const center = box.left + box.width / 2;
        const next = tab.nextElementSibling;
        const previous = tab.previousElementSibling;
        const nextBox = next?.getBoundingClientRect();
        const previousBox = previous?.getBoundingClientRect();
        if (next && direction * (center - (nextBox.left + nextBox.width / 2)) > 0) strip.insertBefore(tab, next.nextElementSibling);
        else if (previous && !previous.classList.contains("home") && direction * (center - (previousBox.left + previousBox.width / 2)) < 0) strip.insertBefore(tab, previous);
        else break;
        place();
    }
    // near the edge of the strip, it scrolls
    const area = strip.getBoundingClientRect();
    const homeWidth = strip.querySelector(".tab.home")?.offsetWidth || 0;
    if (event.clientX > area.right - 32) strip.scrollLeft += 12;
    else if (event.clientX < area.left + homeWidth + 32) strip.scrollLeft -= 12;
});
function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { tab, strip, active } = drag;
    drag = null;
    if (!active) return;
    tab.classList.remove("dragging");
    tab.style.transform = "";
    try { tab.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    state.tabs = tabsOf(strip).map((item) => item.dataset.id).filter((id) => id !== state.home);
    saveFilters();
    renderTabs();
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);
document.getElementById("tabs").addEventListener("click", (event) => { if (justDragged) { event.stopPropagation(); event.preventDefault(); } }, true);

function syncViewer() {
    const viewer = document.getElementById("viewer");
    const onHome = state.active === state.home;
    viewer.hidden = onHome;
    document.getElementById("home").hidden = !onHome || !!state.page;
    document.getElementById("page").hidden = !onHome || !state.page;
    document.getElementById("footer").hidden = !onHome;

    viewer.querySelectorAll("iframe").forEach((frame) => {
        if (!state.tabs.includes(frame.dataset.id)) { frame.remove(); delete state.frames[frame.dataset.id]; }
    });
    state.tabs.forEach((id) => {
        const project = findProject(id);
        if (!project) return;
        let frame = viewer.querySelector(`iframe[data-id="${id}"]`);
        if (!frame) {
            frame = createElement("iframe");
            frame.dataset.id = id;
            frame.src = project.url + (state.frames[id] ? `?${state.frames[id]}` : "");
            frame.allow = "fullscreen; clipboard-write";
            viewer.appendChild(frame);
        }
        frame.title = pickText(project.name);
        frame.hidden = id !== state.active;
    });
}

// An app in a tab says what is on its screen (assets/js/url.js): its query string is kept in the address of this page, so a reload opens it the same.
window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.data?.type !== "kancamu:url" || typeof event.data.search !== "string") return;
    const frame = [...document.querySelectorAll("#viewer iframe")].find((candidate) => candidate.contentWindow === event.source);
    if (!frame || !state.tabs.includes(frame.dataset.id)) return;
    if (event.data.search) state.frames[frame.dataset.id] = event.data.search; else delete state.frames[frame.dataset.id];
    saveFilters();
});

/* ---------- the pages (About, Terms and conditions): the texts are in data.js, in "pages" ---------- */
function openPage(name) {
    state.page = name;
    saveFilters();
    syncViewer();
    renderPage();
    document.getElementById("page").scrollTop = 0;
}

function renderPage() {
    const box = document.getElementById("page");
    const content = i18n.data.pages[state.page];
    if (!content) return box.replaceChildren();
    const back = createElement("button", "page-back");
    back.type = "button";
    back.append(createElement("span", "", t("page.back")));
    back.addEventListener("click", () => openPage(""));
    const parts = [back, createElement("span", "page-title", t(`${state.page}.title`))];
    if (content.updated) parts.push(createElement("span", "page-updated", t("page.updated", { date: i18n.date(content.updated, { dateStyle: "long" }) })));
    for (const section of content.sections) {
        parts.push(createElement("span", "page-heading", pickText(section.heading)), createElement("span", "page-text selectable", pickText(section.text)));
        if (section.links) {   // links to other sites (the sources of the images): they open in a tab of their own
            const links = createElement("div", "page-links");
            links.append(...section.links.map(({ label, url }) => Object.assign(createElement("a", "page-link", label), { href: url, target: "_blank", rel: "noopener noreferrer" })));
            parts.push(links);
        }
    }
    box.replaceChildren(...parts);
}
document.getElementById("about-button").addEventListener("click", () => openPage("about"));
document.getElementById("terms-button").addEventListener("click", () => openPage("terms"));

function syncControls() {
    document.getElementById("reset-button").hidden =
        !state.query && state.category === "all" && state.publisher === "all" && state.alternative === "all";
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
    renderAlternativeSelect();
    renderCategoryFilter();
    renderProjects();
    renderPage();
}

// The icon of a project is its place in the sprite of the icons (one file for all of them, so the page asks for one and not for one per app), or its own file when it is not in the sprite.
// The sprite has the squares of the icons (16 px for a pixel icon, up to 48 px for the others): the box of the icon shows one of them (every box is a square, so the percentages cut it exactly).
// The place of a square in a grid of squares (the columns are in data.js; the rows are as many as they need): the size and the position of a background that shows only that square (the splash)
function spriteCell(count, columns, index) {
    const wide = columns || count;   // a sprite without columns is a row
    const rows = Math.ceil(count / wide);
    const column = index % wide;
    const row = Math.floor(index / wide);
    return { size: `${wide * 100}% ${rows * 100}%`, position: `${wide > 1 ? (column / (wide - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%` };
}

function setIcon(element, project) {
    const sprite = state.iconSprite;
    const cell = sprite?.cells?.[project.id];   // [x, y, side]: the square of this icon in the file (a square of 16 px for a pixel icon, up to 48 px for the others)
    if (!cell) {
        element.style.backgroundImage = `url(${JSON.stringify(project.icon)})`;
        return;
    }
    const [x, y, side] = cell;
    element.style.backgroundImage = `url(${JSON.stringify(sprite.file)})`;
    element.style.backgroundSize = `${(sprite.width / side) * 100}% ${(sprite.height / side) * 100}%`;
    // a background-position of p% puts the p% of the file on the p% of the box: for a square that is at x, p = x / (width - side)
    element.style.backgroundPosition = `${sprite.width > side ? (x / (sprite.width - side)) * 100 : 0}% ${sprite.height > side ? (y / (sprite.height - side)) * 100 : 0}%`;   // every icon is scaled with no smoothing (image-rendering: pixelated, in layout.css)
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

// The menu of a project: the menu of the template (assets/js/components.js); a second click on the button closes it.
function showMenu(anchor, project) {
    components.menu({
        anchor,
        align: "end",
        items: [
            {
                label: t("copyLink"),
                async onSelect() {
                    try {
                        await navigator.clipboard.writeText(new URL(project.url, location.href).href);
                        popups.toast(t("copied"));
                    } catch {
                        popups.toast(t("copyFailed"), { kind: "error" });
                    }
                },
            },
            { label: t("openNew"), onSelect: () => window.open(project.url, "_blank", "noopener") },
            ...(project.source ? [{ label: t("viewSource"), onSelect: () => window.open(project.source, "_blank", "noopener") }] : []),
        ],
    });
}

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

    const icon = createElement("div", "app-icon");
    setIcon(icon, project);

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
        showMenu(more, project);
    });

    const actions = createElement("div", "project-actions");
    actions.append(open, more);

    const categories = createElement("div", "project-categories");
    categories.append(
        ...(project.categories || []).map((key) =>
            categoryTag(key)
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

// A category as a tag. The key is on the element, so the style can tell a category from another (Official has a yellow border).
function categoryTag(key) {
    const tag = createElement("span", "category", categoryLabel(key));
    tag.dataset.category = key;
    tag.classList.toggle("active", state.category === key);   // the category that is filtered shows as active on every project that has it
    return tag;
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

// Every product that some project is an alternative to; a project may be an alternative to several.
function renderAlternativeSelect() {
    const select = document.getElementById("alternative-filter");
    const alternatives = [...new Set(state.projects.flatMap((project) => project.alternatives || []))]
        .sort((a, b) => a.localeCompare(b, i18n.lang));
    const options = [["all", t("allAlternatives")], ...alternatives.map((name) => [name, name])];
    select.replaceChildren(
        ...options.map(([value, label]) => {
            const option = createElement("option", "", label);
            option.value = value;
            return option;
        })
    );
    if (!alternatives.includes(state.alternative)) state.alternative = "all";
    select.value = state.alternative;
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
            button.dataset.category = key;
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
            state.alternative === "all" || (project.alternatives || []).includes(state.alternative)
        )
        .filter((project) =>
            `${pickText(project.name)} ${pickText(project.description)} ${(project.alternatives || []).join(" ")}`.toLowerCase().includes(query)
        )
        .sort((a, b) => direction * pickText(a.name).localeCompare(pickText(b.name)));

    if (projects.length === 0) {
        list.replaceChildren(components.make("empty", { icon: "search", heading: t("empty") }));
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

/* ---------- the splash: a layer over the content for a moment when the site opens ---------- */
// Its images (data.js, "splash") slide one after another every few seconds, in the order of the list (and not at all when the device asks for less motion). The content is loaded behind it.
// It stays until the user clicks or presses a key, and the user can turn it off in the Appearance page of the account app (the setting "splash").
async function showSplash({ images, seconds, sprite }) {   // the first image is the first of the list
    const splash = document.getElementById("splash");
    if (settings.get("appearance").splash === false) return;
    const order = images;
    // the images are one file (a grid of squares, assets/tools/sprites.mjs makes it); without it, or when it does not have all the images of the list, there is no splash
    if (!sprite || sprite.count !== order.length) return;
    // the splash opens with its images ready, not empty
    const preload = new Image();
    preload.src = sprite.file;
    await preload.decode().catch(() => {});
    const track = createElement("div", "splash-track");
    track.append(...order.map((_, index) => {
        const slide = createElement("div", "splash-slide");
        const cell = spriteCell(order.length, sprite.columns, index);   // the square of this image (the slide is a square too)
        slide.style.backgroundImage = `url(${JSON.stringify(sprite.file)})`;
        slide.style.backgroundSize = cell.size;
        slide.style.backgroundPosition = cell.position;
        return slide;
    }));
    // the dots tell which image shows (and how many there are); the slides keep their place in the list, because the track turns round
    track.querySelectorAll(".splash-slide").forEach((slide, index) => { slide.dataset.index = index; });
    const dots = createElement("div", "splash-dots");
    dots.setAttribute("aria-hidden", "true");
    dots.append(...order.map(() => createElement("span", "splash-dot")));
    const credit = createElement("span", "splash-credit");   // the author of the image that shows, in the top corner of the image
    const mark = (index) => {
        [...dots.children].forEach((dot, at) => dot.classList.toggle("on", at === index));
        credit.textContent = t("splash.credit", { author: order[index].author });
    };
    mark(0);
    splash.querySelector(".splash-art").replaceChildren(track, dots, credit);
    // every few seconds the track slides by one image, and the image that left goes to the end of it: the images go round without end
    const settle = () => {
        if (!track.classList.contains("moving")) return;
        track.classList.remove("moving");
        track.append(track.firstElementChild);
        track.style.transform = "";
    };
    const slide = () => {
        settle();
        track.getBoundingClientRect();   // the track is in its place before it moves
        track.classList.add("moving");
        mark(Number(track.children[1].dataset.index));   // the image that comes
        track.style.transform = `translateX(${document.documentElement.dir === "rtl" ? 100 : -100}%)`;
        setTimeout(settle, parseFloat(getComputedStyle(track).transitionDuration) * 1000 + 50);   // a timer, not "transitionend": the browser does not send it when it does not draw (a hidden tab)
    };
    const timer = order.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches ? setInterval(slide, seconds * 1000) : 0;
    splash.querySelector(".splash-name").replaceChildren(createNameElement(i18n.brand.name, i18n.brand.highlight));
    splash.hidden = false;
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        document.removeEventListener("keydown", close);
        splash.classList.add("leaving");
        setTimeout(() => { splash.hidden = true; splash.classList.remove("leaving"); }, 400);
    };
    splash.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
}

async function loadData() {
    const data = await i18n.load();

    state.home = data.home;
    state.categories = data.categories;
    state.projects = data.projects;
    state.iconSprite = data.iconSprite || null;
    document.getElementById("support-link").href = data.support.url;   // the support of Kancamu (data.js, "support")
    restoreFilters();
    i18n.selects();
    renderAll();
    syncControls();
    syncViewer();
    showSplash(data.splash);
    document.body.classList.add("ready");   // the page is made: what was hidden until now shows (layout.css), all at once
}

function load() {
    loadData().catch((error) => {
        console.error(error);
        document.getElementById("project-list").replaceChildren(
            components.make("empty", { icon: "alert", heading: t("errorLoad") })
        );
        document.body.classList.add("ready");
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
    components.closeOverlay();
    renderAll();
});

/* ---------- a file of the Drive dragged to any app ---------- */
// TODO: this is a workaround (see TODO.md, "Retest"); retest from time to time whether a plain drag with the file works, and delete this then.
// A page cannot put a file in a drag (the browser keeps only an image), but the apps run in frames of this page, and this page is the one that knows what is dragged:
// the app that drags a file says it (assets/js/transfer.js), and every drag event that goes into the frame of another app, with no file in it, is given again with the real
// file in it, as if it came from the file explorer. So the drop area of any app (ours or somebody else's) gets the file, whatever its kind.
let carried = null;   // { name, file }: the file that an app is dragging now
window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.data?.type !== "kancamu:drag") return;
    if (!event.data.on) { carried = null; return; }
    const entry = { name: event.data.name, file: null };
    carried = entry;
    fetch(event.data.url).then((response) => response.blob()).then((blob) => { entry.file = new File([blob], entry.name, { type: blob.type }); }).catch(() => { if (carried === entry) carried = null; });
});
const bridged = new WeakSet();
function bridge(frame) {
    let doc;
    try { doc = frame.contentDocument; } catch { return; }
    if (!doc || bridged.has(doc)) return;
    bridged.add(doc);
    for (const type of ["dragenter", "dragover", "drop"]) {
        doc.addEventListener(type, (event) => {
            if (!event.isTrusted || !carried?.file || event.dataTransfer.types.includes("Files")) return;
            event.stopImmediatePropagation();
            const transfer = new DataTransfer();
            transfer.items.add(carried.file);
            transfer.effectAllowed = "copy";
            const copy = new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: transfer, view: event.view, clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY, relatedTarget: event.relatedTarget });
            event.target.dispatchEvent(copy);
            if (copy.defaultPrevented) event.preventDefault();
            if (type !== "drop") event.dataTransfer.dropEffect = "copy";
        }, true);
    }
}
document.getElementById("viewer").addEventListener("load", (event) => { if (event.target.tagName === "IFRAME") bridge(event.target); }, true);

/* ---------- a dragged file opens the app that takes it ---------- */
// A file (of the Drive, dragged from Drivemu or Gallemu, or of the computer) that waits over the tab of any app opens that app; the file is then dropped
// in the drop area of the page. The tab itself does not take the drop.
const isFile = (event) => ["Files", "text/uri-list"].some((type) => event.dataTransfer.types.includes(type));
const projectOfTab = (event) => {
    const tab = event.target.closest?.(".tab");
    return tab && tab.dataset.id !== state.home ? { tab, project: findProject(tab.dataset.id) } : {};
};
const clearDropTargets = () => document.querySelectorAll("#tabs .tab.drop-target").forEach((tab) => tab.classList.remove("drop-target"));
const tabStrip = document.getElementById("tabs");
let waitingOver = "", waitingTimer = 0;
const stopWaiting = () => { clearTimeout(waitingTimer); waitingOver = ""; };
tabStrip.addEventListener("dragover", (event) => {
    const { tab, project } = projectOfTab(event);
    clearDropTargets();
    if (!project || !isFile(event)) { stopWaiting(); return; }
    tab.classList.add("drop-target");
    if (waitingOver !== project.id) {
        stopWaiting();
        waitingOver = project.id;
        waitingTimer = setTimeout(() => { waitingOver = ""; if (state.active !== project.id) selectTab(project.id); }, 500);
    }
});
tabStrip.addEventListener("dragleave", (event) => { if (!tabStrip.contains(event.relatedTarget)) { clearDropTargets(); stopWaiting(); } });
document.addEventListener("dragend", () => { clearDropTargets(); stopWaiting(); });
document.addEventListener("drop", () => { clearDropTargets(); stopWaiting(); });

document.getElementById("theme-button").addEventListener("click", () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    try {
        localStorage.setItem("theme", root.dataset.theme);
    } catch {}
});

// Account: the sign-in is the account app, opened by assets/js/account.js.
account.bind(document.getElementById("account-button"));

document.getElementById("publisher-filter").addEventListener("change", (event) => {
    state.publisher = event.target.value;
    saveFilters();
    renderProjects();
});

document.getElementById("alternative-filter").addEventListener("change", (event) => {
    state.alternative = event.target.value;
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
    state.alternative = "all";
    saveFilters();
    document.getElementById("project-search").value = "";
    document.getElementById("publisher-filter").value = "all";
    document.getElementById("alternative-filter").value = "all";
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
