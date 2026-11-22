// The account web: the sign-in, the profile, and the settings of every web. The query string says which page shows:
//   ?page=login  ?page=profile  ?page=settings&app=<app>
// Any web opens it with its account button, account.open() (assets/js/account.js), which embeds this page in a dialog.
// The settings of a web are described in its data.json ("settings": fields, defaults, and panels), and are only changed here.
import { panels } from "./panels.js";

const { element } = components;
const $ = (id) => document.getElementById(id);
const t = (key) => i18n.t(key);
const embedded = window.parent !== window;
const query = new URLSearchParams(location.search);
const state = { page: query.get("page") || "", app: query.get("app") || "", appData: null, apps: [], loaded: false, run: 0 };   // apps: the webs that have settings, { id, name, icon, data }

// What GitHub tells about the account and the token, fetched once per token.
let details = null;
async function fetchDetails(token) {
    let response;
    try {
        response = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        });
    } catch {
        return null;
    }
    if (response.status === 401) {
        account.signOut();
        return null;
    }
    if (!response.ok) return null;
    const header = (name) => response.headers.get(name);
    return {
        token,
        user: await response.json(),
        scopes: (header("x-oauth-scopes") || "").split(",").map((scope) => scope.trim()).filter(Boolean),
        limit: header("x-ratelimit-limit"),
        remaining: header("x-ratelimit-remaining"),
        expires: header("github-authentication-token-expiration"),
    };
}


function section(title, rows) {
    const box = element("div", "detail-section");
    const list = element("div", "detail-rows");
    for (const [key, value] of rows) {
        if (value === null || value === undefined || value === "") continue;
        const row = element("div", "detail-row");
        const cell = element("span", "value");
        if (value instanceof Node) cell.append(value);
        else cell.textContent = value;
        row.append(element("span", "detail-key", key), cell);
        list.append(row);
    }
    box.append(element("span", "detail-section-title", title), list);
    return box;
}

function renderDetails() {
    const box = $("account-details");
    const stats = $("profile-stats");
    if (!details) { box.replaceChildren(); return stats.replaceChildren(); }
    const { user } = details;
    const link = user.html_url ? Object.assign(element("a", "", user.html_url.replace("https://", "")), { href: user.html_url, target: "_blank", rel: "noopener" }) : null;
    const date = (value) => (value ? i18n.date(value, { year: "numeric", month: "long", day: "numeric" }) : "");
    const scopes = details.scopes.length ? element("span", "scope-chips") : null;
    details.scopes.forEach((scope) => scopes.append(element("span", "badge", scope)));
    // The numbers of the account, as a row of tiles
    const numbers = [
        [t("publicRepos"), user.public_repos],
        [t("privateRepos"), user.owned_private_repos],
        [t("followers"), user.followers],
        [t("memberSince"), user.created_at ? String(new Date(user.created_at).getFullYear()) : null],
    ].filter(([, value]) => value !== null && value !== undefined);
    stats.replaceChildren(...numbers.map(([label, value]) => {
        const tile = element("div", "stat");
        tile.append(element("span", "stat-value", typeof value === "number" ? i18n.number(value) : value), element("span", "stat-label", label));
        return tile;
    }));
    // The rest opens and closes, like the settings
    box.replaceChildren(
        collapsible(section(t("profile"), [
            [t("githubProfile"), link],
            [t("email"), user.email],
            [t("company"), user.company],
            [t("location"), user.location],
            [t("website"), user.blog],
            [t("plan"), user.plan && user.plan.name],
        ])),
        collapsible(section(t("tokenTitle"), [
            [t("tokenType"), t("tokenKind.oauth")],
            [t("tokenValue"), `…${details.token.slice(-4)}`],
            [t("scopes"), scopes],
            [t("apiLeft"), details.remaining && i18n.t("apiLeftValue", { remaining: details.remaining, limit: details.limit })],
            [t("expires"), date(details.expires)],
        ]))
    );
    $("account-profile").querySelector(".account-bio").textContent = user.bio || "";
}

/* ---------- the pages ---------- */
// The page that shows: the settings when asked, else the profile when signed in, else the sign-in.
const pageNow = () => (state.page === "settings" && (selectedApp() || !state.loaded) ? "settings" : account.get() ? "profile" : "login");
// The web whose settings show: the one asked, when it has settings.
const selectedApp = () => (state.apps.some((app) => app.id === state.app && app.data?.settings) ? state.app : "");

function render() {
    const user = account.get();
    const page = pageNow();
    const selected = selectedApp();
    $("login-page").hidden = page !== "login";
    $("account-profile").hidden = page !== "profile";
    $("settings-page").hidden = page !== "settings";
    renderSide(page, selected);
    if (user) {
        $("account-profile").querySelector(".avatar").style.backgroundImage = `url("${user.avatar}")`;
        $("account-profile").querySelector(".account-name").textContent = user.name;
        $("account-profile").querySelector(".account-login").textContent = `@${user.login}`;
        if (details?.token === user.token) renderDetails();
        else {
            details = null;
            renderDetails();
            fetchDetails(user.token).then((found) => {
                if (!found || account.get()?.token !== user.token) return;
                details = found;
                renderDetails();
            });
        }
    } else {
        details = null;
    }
    if (page === "settings") renderSettings();
}

// The sidebar: the account, and every web (its button is disabled when the web has no settings yet).
function renderSide(page, selected) {
    const mark = (tab, on) => { tab.classList.toggle("on", on); tab.setAttribute("aria-selected", on); };
    mark($("account-tab"), page !== "settings");
    $("sidebar-apps").replaceChildren(...state.apps.map((app) => {
        const item = element("button", "sidebar-item");
        item.type = "button";
        const icon = element("span", "app-icon");
        icon.style.backgroundImage = `url("../${app.icon}")`;
        const name = element("span", "app-name");
        const highlight = element("span", "highlight", app.parts[1]);
        highlight.style.color = app.color;   // the colour of the project (a hex, or the name of a colour of the page)
        name.append(app.parts[0], highlight, app.parts[2]);
        item.append(icon, name);
        item.disabled = !app.data?.settings;   // a web that has no settings yet
        mark(item, page === "settings" && selected === app.id);
        item.addEventListener("click", () => showPage("settings", app.id));
        return item;
    }));
}

// An item of the sidebar changes the page without loading this web again, and the address follows.
function showPage(page, app = "") {
    state.page = page;
    state.app = app;
    const url = new URL(location.href);
    url.searchParams.set("page", page);
    if (app) url.searchParams.set("app", app); else url.searchParams.delete("app");
    history.replaceState(null, "", url);
    render();
}
$("account-tab").addEventListener("click", () => showPage("account"));

/* ---------- the settings ---------- */
const appData = async (app) => {
    if (!/^[a-z0-9-]+$/.test(app)) return null;
    try {
        const response = await fetch(`../${app}/data.json`, { cache: "no-store" });
        if (!response.ok) return null;
        const text = JSON.stringify(await response.json()).replaceAll("{highlight}", i18n.brand.highlight).replaceAll("{brand}", i18n.brand.name);
        return JSON.parse(text);
    } catch {
        return null;
    }
};
// Every web of the brand, with its data.json when it has one: { id, name, icon, data }. A web has settings when its data.json has a "settings" part.
async function loadApps() {
    let projects = [];
    try { projects = (await (await fetch("../data.json", { cache: "no-store" })).json()).projects; } catch { return []; }
    const fill = (text) => text.replaceAll("{highlight}", i18n.brand.highlight).replaceAll("{brand}", i18n.brand.name);
    const found = await Promise.all(projects.filter((project) => project.publisher === "{brand}").map(async (project) => {
        const folder = /^[a-z0-9-]+\/$/.test(project.url || "") ? project.url.slice(0, -1) : "";
        const name = fill(i18n.pick(project.name));
        const highlight = fill(i18n.pick(project.highlight || {}));   // the highlighted part of the name (the "mu"), found in it like the main web does
        const at = highlight ? name.indexOf(highlight) : -1;
        const parts = at < 0 ? [name, "", ""] : [name.slice(0, at), highlight, name.slice(at + highlight.length)];
        return { id: folder || project.id, name, parts, color: /^#/.test(project.color) ? project.color : `var(--${project.color})`, icon: project.icon, data: folder ? await appData(folder) : null };
    }));
    // The webs that have settings first, then the ones that have none (their buttons are disabled), each group by name.
    return found.sort((a, b) => Number(!a.data?.settings) - Number(!b.data?.settings) || a.name.localeCompare(b.name, i18n.lang));
}

// A text of the web that is being set, in the language of the page.
const appText = (key, params = {}) => (state.appData.ui?.[key] ? i18n.pick(state.appData.ui[key]) : key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");


// One button in the header toggles the theme; its icon is the theme that a click gives (a sun in the dark theme).
$("theme-button").addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch {}
    markTheme();
});
function markTheme() {
    const light = document.documentElement.dataset.theme === "light";
    const icon = $("theme-button").querySelector(".icon");
    icon.classList.toggle("icon-sun", !light);
    icon.classList.toggle("icon-moon", light);
}
window.addEventListener("storage", (event) => {
    if (event.key === "theme" || event.key === null) markTheme();
});

// The options of a select: written in the field ("options": [{ value, label }]), or taken from a list of the data.json of the web
// ("optionsFrom": { "list": "video.formats", "value": "id", "label": "name" }, a list of plain values has no value and label, and "labelPrefix" makes the label a text of the web).
function optionsOf(definition) {
    const from = definition.optionsFrom;
    const items = definition.options || (from.list.split(".").reduce((node, key) => node?.[key], state.appData) || []).map((item) => {
        const value = from.value ? item[from.value] : item;
        return { value, label: from.labelPrefix ? appText(from.labelPrefix + value) : from.label ? item[from.label] : String(value) };
    });
    return definition.empty ? [{ value: "", label: appText(definition.empty) }, ...items] : items;
}

// A part of the settings opens and closes: its title becomes a button, and the rest goes in a body that hides. Every part is open when the page is shown.
function collapsible(box) {
    const title = box.querySelector(":scope > .detail-section-title");
    if (!title) return box;   // a panel that shows nothing
    const part = components.make("collapsible", { heading: title.textContent, open: true }, [...box.children].filter((child) => child !== title));
    part.classList.add("detail-section");
    return part;
}

// A field of the web that is being set: a label, a hint, and a control. The value is saved at once, kept in range.
function field(definition, values, save) {
    const box = element("label", `setting-field ${definition.type}`);
    const label = element("span", "field-label", appText(definition.label));
    let control;
    if (definition.type === "textarea") control = element("textarea");
    else if (definition.type === "select") {
        control = element("select");
        control.append(...optionsOf(definition).map((option) => Object.assign(element("option"), { value: option.value, textContent: option.label })));
    } else {
        control = element("input");
        control.type = definition.type;
    }
    for (const name of ["min", "max", "step"]) if (definition[name] !== undefined) control[name] = definition[name];
    if (definition.type === "checkbox") control.checked = !!values[definition.id];
    else control.value = values[definition.id];
    if (definition.type === "range") {
        const shown = element("span", "field-value", control.value);
        label.append(": ", shown);
        control.addEventListener("input", () => (shown.textContent = control.value));
    }
    control.addEventListener("change", () => save(definition, control));
    const hint = definition.hint ? [element("span", "field-hint", appText(definition.hint))] : [];
    if (definition.type === "checkbox") box.append(control, label, ...hint);
    else box.append(label, ...hint, control);
    return box;
}

async function renderSettings() {
    const page = $("settings-page");
    state.run++;   // what an earlier call is still waiting for is not shown any more
    const app = selectedApp();
    if (!app) return page.replaceChildren();
    state.appData = state.apps.find((item) => item.id === app).data;
    const config = state.appData.settings;
    const nodes = [];
    const defaults = config.defaults || {};
    if (config.fields?.length) {   // the values of the web, under its name
        const save = (definition, control) => {
            let value;
            if (definition.type === "checkbox") value = control.checked;
            else if (definition.type === "number" || definition.type === "range") {
                value = Math.min(definition.max, Math.max(definition.min, Number.isFinite(+control.value) ? +control.value : defaults[definition.id]));
                control.value = value;
            } else if (definition.type === "select" && typeof defaults[definition.id] === "number") value = Number(control.value);
            else value = control.value;
            settings.set(app, { ...settings.get(app, defaults), [definition.id]: value });
        };
        const values = settings.get(app, defaults);
        const form = element("div", "setting-fields");
        form.append(...config.fields.map((definition) => field(definition, values, save)));
        const reset = element("button");
        reset.type = "button";
        reset.innerHTML = '<span class="icon icon-refresh"></span><span></span>';
        reset.lastChild.textContent = t("settings.reset");
        reset.addEventListener("click", () => { settings.reset(app); renderSettings(); });
        const box = element("div", "detail-section");
        box.append(element("span", "detail-section-title", t("settings.general")), form, reset);
        nodes.push(collapsible(box));
    }
    const context = { app, data: state.appData, t: appText, ask: (options) => popups.ask(options), toast: (text, options) => popups.toast(text, options), announce: (message) => settings.announce(app, message) };
    // The fields show at once; every panel takes its place when it is ready (some ask GitHub).
    const run = ++state.run;
    const waiting = (config.panels || []).filter((name) => panels[name]).map((name) => {
        const place = element("div");
        nodes.push(place);
        return Promise.resolve(panels[name](context)).then((node) => { if (state.run === run) place.replaceWith(collapsible(node)); }, () => place.remove());
    });
    page.replaceChildren(...nodes);
    await Promise.all(waiting);
    if (state.run === run && !page.textContent.trim()) page.append(element("span", "hint", t("settings.empty")));   // the panels of a web that need the account show nothing without it
}

// The error under the button of the sign-in: the alert of the kit, shown when it has a text
function showLoginError(message) {
    $("login-error").heading = message;
    $("login-error").hidden = !message;
}

// "Sign in with GitHub": the whole page goes to GitHub, and comes back to callback.html (assets/js/account.js)
$("github-button").addEventListener("click", async () => {
    const button = $("github-button");
    showLoginError("");
    button.disabled = true;
    try {
        await account.signInWithGitHub();
    } catch (failure) {
        showLoginError(t(`error.${failure.code || "failed"}`));
        button.disabled = false;
    }
});

$("sign-out-button").addEventListener("click", () => account.signOut());

$("close-button").hidden = !embedded;
$("close-button").addEventListener("click", () => window.parent.postMessage({ type: "account:close" }, location.origin));
// On a narrow screen the list is hidden, and the button of the first row opens it over the page (Escape closes it first).
const menu = components.drawer({ sidebar: $("sidebar"), button: $("menu-button") });
$("sidebar").addEventListener("click", (event) => { if (event.target.closest(".sidebar-item")) menu.set(false); });
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && embedded) window.parent.postMessage({ type: "account:close" }, location.origin);
});

// The first control, so the keyboard works at once when the dialog opens.
const focusFirst = () => (pageNow() === "login" ? $("github-button") : document.querySelector(".content")).focus({ preventScroll: true });
window.addEventListener("message", (event) => {
    if (event.origin === location.origin && event.data?.type === "account:focus") focusFirst();
});

await i18n.load();
loadApps().then((found) => { state.apps = found; state.loaded = true; render(); });   // the sidebar fills in when the webs are known; the page does not wait for it
account.onChange(render);
i18n.onChange(render);
i18n.selects();   // the language select in the header
markTheme();
render();
if (embedded) focusFirst();
