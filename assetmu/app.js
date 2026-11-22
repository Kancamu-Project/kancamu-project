// Assetmu: shows every asset of the apps: the colours (read from the page, so they follow the theme), the colour and icon of every app, the icons, the fonts, the sizes, and the files. The templates, the helpers, and the popups are in Kitmu.
await i18n.load();
i18n.selects();

const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const { element } = components;
const { palette, roles, sizes, icons, fonts, files, sectionOrder } = i18n.data;

/* ---------- reading the page: the value of a colour or a length as the page has it now ---------- */
const probe = element("div", "probe");
document.querySelector(".main").append(probe);   // not in the body: the body holds the sidebar and the main only
const computed = (property, value) => {
  probe.style[property] = "";
  probe.style[property] = value;
  return getComputedStyle(probe)[property];
};
const canvas = Object.assign(document.createElement("canvas"), { width: 1, height: 1 });
const paint = canvas.getContext("2d", { willReadFrequently: true });
function hexOf(css) {   // any colour the browser knows, as #rrggbb
  paint.clearRect(0, 0, 1, 1);
  paint.fillStyle = "#000000";
  paint.fillStyle = css;
  paint.fillRect(0, 0, 1, 1);
  const [red, green, blue] = paint.getImageData(0, 0, 1, 1).data;
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
const colourValue = (name) => hexOf(computed("backgroundColor", `var(--${name})`));
const lengthValue = (name) => {
  const pixels = parseFloat(computed("width", `var(--${name})`));
  const rem = pixels / parseFloat(getComputedStyle(document.documentElement).fontSize);
  return `${i18n.number(Math.round(rem * 100) / 100)} rem · ${i18n.number(Math.round(pixels * 10) / 10)} px`;
};

/* ---------- copying ---------- */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    popups.toast(tr("copied", { text }));
  } catch {
    popups.toast(tr("copy.failed"), { kind: "error" });
  }
}

/* ---------- the sections: built once, filled again when the language or the theme changes ---------- */
const sections = {};
for (const id of sectionOrder) {
  const box = element("div", "asset-section");
  box.id = `section-${id}`;
  const title = element("span", "section-title");
  const hint = element("span", "section-hint");
  const body = element("div", "group");
  box.append(title, hint, body);
  sections[id] = { box, title, hint, body };
}
$("content").replaceChildren(...sectionOrder.map((id) => sections[id].box));
const heading = (id) => {
  sections[id].title.textContent = tr(`section.${id}`);
  sections[id].hint.textContent = tr(id === "colours" ? "colours.paletteHint" : `${id}.hint`);
};

/* ---------- colours ---------- */
function swatch(entry) {
  const button = element("button", "swatch");
  button.type = "button";
  button.style.setProperty("--swatch", `var(--${entry.name})`);
  button.style.setProperty("--ink", `var(--${entry.ink})`);
  const meta = element("span", "swatch-meta");
  meta.append(element("span", "swatch-name", `--${entry.name}`), element("span", "swatch-value", colourValue(entry.name)));
  button.append(element("span", "swatch-sample", "Aa"), meta);
  button.addEventListener("click", () => copy(`var(--${entry.name})`));
  return button;
}
function renderColours() {
  heading("colours");
  const group = (titleKey, hintKey, entries) => {
    const box = element("div", "group");
    box.append(element("span", "group-title", tr(titleKey)));
    if (hintKey) box.append(element("span", "section-hint", tr(hintKey)));
    const grid = element("div", "swatch-grid");
    grid.append(...entries.map(swatch));
    box.append(grid);
    return box;
  };
  sections.colours.body.replaceChildren(group("colours.palette", "", palette), group("colours.roles", "colours.rolesHint", roles));
}

/* ---------- the apps: the icon, the name with its highlight, and the colour of each project of the main website ---------- */
let projects = [];
try { projects = (await (await fetch("../data.json", { cache: "no-store" })).json()).projects; } catch { /* the section stays empty */ }
const fill = (text) => text.replaceAll("{highlight}", i18n.brand.highlight).replaceAll("{brand}", i18n.brand.name);
function renderApps() {
  heading("apps");
  const rows = projects.map((project) => {
    const name = fill(i18n.pick(project.name));
    const highlight = fill(i18n.pick(project.highlight || {}));
    const at = highlight ? name.indexOf(highlight) : -1;
    const colour = project.color;   // the colour of a project is its own (a hex from its icon), not a colour of the palette: a project can come from outside
    const row = element("button", "app-row");
    row.type = "button";
    const icon = element("span", "app-icon");
    icon.style.backgroundImage = `url("${/^https?:/.test(project.icon) ? project.icon : `../${project.icon}`}")`;   // an icon can be a file of this site or an address (TraceDraw)
    const label = element("span", "app-name");
    const mark = element("span", "highlight", at < 0 ? "" : highlight);
    mark.style.color = colour;
    label.append(...(at < 0 ? [name] : [name.slice(0, at), mark, name.slice(at + highlight.length)]));
    const chip = element("span", "app-colour");
    const sample = element("span", "app-chip");
    sample.style.setProperty("--chip", colour);
    chip.append(sample, element("span", "", colour));
    row.append(icon, label, chip);
    row.addEventListener("click", () => copy(colour));
    return { name, row };
  });
  const list = element("div", "app-list");
  list.append(...rows.sort((a, b) => a.name.localeCompare(b.name, i18n.lang)).map((entry) => entry.row));
  sections.apps.body.replaceChildren(list);
}

/* ---------- icons ---------- */
const search = element("input");
search.type = "search";
search.setAttribute("data-i18n-placeholder", "icons.search");
search.setAttribute("data-i18n-label", "icons.searchLabel");
search.value = urlState.get("q");   // the search and the section that is shown are in the address (?q=...&section=...), assets/js/url.js
const searchbox = element("label", "searchbox");
searchbox.append(element("span", "icon icon-search"), search);
const count = element("span", "section-hint");
const iconGrid = element("div", "icon-grid");
function renderIcons() {
  heading("icons");
  search.placeholder = tr("icons.search");
  search.setAttribute("aria-label", tr("icons.searchLabel"));
  const query = search.value.trim().toLowerCase();
  const shown = icons.filter((name) => !query || name.includes(query));
  count.textContent = tr("icons.count", { count: i18n.number(shown.length) });
  iconGrid.replaceChildren(...(shown.length ? shown.map((name) => {
    const tile = element("button", "icon-tile");
    tile.type = "button";
    const glyph = element("span", "icon");
    glyph.style.setProperty("--icon", `url("${new URL(`../assets/icons/${name}.svg`, location.href).href}")`);
    tile.append(glyph, element("span", "icon-name", name));
    tile.title = `${name}.svg`;
    tile.addEventListener("click", () => copy(`${name}.svg`));
    return tile;
  }) : [element("span", "empty", tr("icons.none"))]));
}
sections.icons.body.append(searchbox, count, iconGrid);
search.addEventListener("input", () => { urlState.set({ q: search.value.trim() }); renderIcons(); });
autocomplete.attach(search, { suggestions: () => icons });

/* ---------- fonts ---------- */
function renderFonts() {
  heading("fonts");
  const list = element("div", "font-list");
  list.append(...fonts.map((font) => {
    const card = element("div", "font-card");
    const sample = element("span", "font-sample", font.loaded ? tr("fonts.sample") : font.family);
    if (font.loaded) { sample.style.fontFamily = `"${font.family}"`; sample.style.fontWeight = font.weight; }
    card.append(sample, element("span", "font-meta", `${font.family} ${font.weight} · ${font.file}${font.loaded ? "" : ` · ${tr("fonts.notLoaded")}`}`));
    return card;
  }));
  sections.fonts.body.replaceChildren(list);
}

/* ---------- sizes: each scale of style.css, with its value and a demonstration ---------- */
const demoOf = { gap: "demo-bar", padding: "demo-bar", fontSize: "demo-text", radius: "demo-radius", iconSize: "demo-box", other: "demo-bar" };
function renderSizes() {
  heading("sizes");
  sections.sizes.body.replaceChildren(...sizes.map((group) => {
    const box = element("div", "group");
    box.append(element("span", "group-title", tr(`sizes.${group.group}`)));
    const list = element("div", "size-list");
    list.append(...group.names.map((name) => {
      const row = element("div", "size-row");
      const demo = element("div", demoOf[group.group], group.group === "fontSize" ? "Aa" : "");
      demo.style.setProperty("--size", `var(--${name})`);
      row.append(element("span", "size-name", `--${name}`), element("span", "size-value", lengthValue(name)), demo);
      return row;
    }));
    box.append(list);
    return box;
  }));
}

/* ---------- files ---------- */
function renderFiles() {
  heading("files");
  const list = element("div", "file-list");
  list.append(...files.map((file) => {
    const row = element("div", "file-row");
    row.append(element("span", "file-name", file.name), element("span", "file-description", i18n.pick(file.description)));
    return row;
  }));
  sections.files.body.replaceChildren(list);
}

/* ---------- the sidebar: a button for each section, which scrolls to it ---------- */
// On a narrow screen the sections are hidden, and a button opens them over the page (Escape closes them and gives the focus back).
const menu = components.drawer({ sidebar: $("sidebar"), button: $("menu-button") });
function renderSide() {
  $("sidebar-nav").replaceChildren(...sectionOrder.map((id) => {
    const item = element("button", "sidebar-item");
    item.type = "button";
    item.dataset.section = id;
    item.append(element("span", "", tr(`section.${id}`)));
    item.addEventListener("click", () => { menu.set(false); sections[id].box.scrollIntoView({ block: "start" }); });
    return item;
  }));
  markSection();
}
// The section that is at the top of the page is marked in the sidebar.
function markSection() {
  const top = $("content").getBoundingClientRect().top + 8;
  let current = sectionOrder[0];
  for (const id of sectionOrder) if (sections[id].box.getBoundingClientRect().top <= top) current = id;
  for (const item of $("sidebar-nav").children) item.classList.toggle("on", item.dataset.section === current);
  if (settled) urlState.set({ section: current === sectionOrder[0] ? "" : current });
}
let settled = false;   // the section of the address is gone to first; until then the scroll does not write it
$("content").addEventListener("scroll", markSection);

function renderAll() {
  renderSide(); renderColours(); renderApps(); renderIcons(); renderFonts(); renderSizes(); renderFiles();
}
renderAll();
i18n.onChange(renderAll);
{   // the section of the address is shown (after the layout, when the fonts have their width)
  const wanted = sections[urlState.get("section")];
  const arrive = () => { wanted?.box.scrollIntoView({ block: "start" }); markSection(); settled = true; };
  requestAnimationFrame(() => requestAnimationFrame(arrive));
  document.fonts?.ready.then(() => { if (!settled) arrive(); else if (wanted) wanted.box.scrollIntoView({ block: "start" }); });
}
// The values follow the theme: when it changes (here, or in another app), the colours are read again.
new MutationObserver(() => { renderColours(); renderApps(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// One button toggles the theme, to see the colours in both of them; its icon is the theme that a click gives (a sun in the dark theme).
function markTheme() {
  const light = document.documentElement.dataset.theme === "light";
  const icon = $("theme-button").querySelector(".icon");
  icon.classList.toggle("icon-sun", !light);
  icon.classList.toggle("icon-moon", light);
}
$("theme-button").addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("theme", theme); } catch { /* ignore */ }
});
new MutationObserver(markTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
window.addEventListener("storage", (event) => { if (event.key === "theme" || event.key === null) markTheme(); });
markTheme();

account.bind($("account-button"));
