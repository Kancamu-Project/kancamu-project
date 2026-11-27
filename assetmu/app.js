import { i18n, popups, account, urlState, autocomplete, components } from "../assets/js/shared.js";
import appData from "./data.js";
import mainSite from "../data.js";

const previewId = new URLSearchParams(location.search).get("preview");

await i18n.load(appData);
i18n.selects();

const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const { element } = components;
const { palette, roles, sizes, icons, fonts, files, sectionOrder } = i18n.data;

const probe = element("div", "probe");
document.querySelector(".main").append(probe);
const computed = (property, value) => {
  probe.style[property] = "";
  probe.style[property] = value;
  return getComputedStyle(probe)[property];
};
const canvas = Object.assign(document.createElement("canvas"), { width: 1, height: 1 });
const paint = canvas.getContext("2d", { willReadFrequently: true });
function hexOf(css) {
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

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    popups.toast(tr("copied", { text }));
  } catch {
    popups.toast(tr("copy.failed"), { kind: "error" });
  }
}

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

const mainData = mainSite;
const projects = mainData.projects;
const fill = (text) => text.replaceAll("{highlight}", i18n.brand.highlight).replaceAll("{brand}", i18n.brand.name);
function renderApps() {
  heading("apps");
  const rows = projects.map((project) => {
    const name = fill(i18n.pick(project.name));
    const highlight = fill(i18n.pick(project.highlight || {}));
    const at = highlight ? name.indexOf(highlight) : -1;
    const colour = project.color;
    const row = element("button", "app-row");
    row.type = "button";
    const icon = element("span", "app-icon");
    icon.style.backgroundImage = `url("${/^https?:/.test(project.icon) ? project.icon : `../${project.icon}`}")`;
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

const cardFill = (text, brand) => text.replaceAll("{highlight}", brand.highlight).replaceAll("{brand}", brand.name);
const address = (path) => (/^https?:/.test(path) ? path : new URL(`../${path}`, import.meta.url).href);

function buildCard({ project, brand, data }) {
  const folder = project.url.replace(/^\.\/?|\/$/g, "");
  const card = element("div", "preview-card");
  card.dataset.id = project.id;
  card.style.setProperty("--preview-colour", project.color);
  const body = element("div", `preview-body${project.id === "kancamu" ? " splash" : ""}`);
  const name = cardFill(project.name["en-US"], brand);
  const highlight = cardFill(project.highlight["en-US"], brand);
  const at = name.indexOf(highlight);
  const nameParts = at < 0 ? [name] : [name.slice(0, at), Object.assign(element("span", "preview-highlight", highlight)), name.slice(at + highlight.length)];

  if (project.id === "kancamu") {
    const ui = (key) => cardFill(data.ui[key]["en-US"], brand);
    const sprite = data.splash.sprite;
    const info = element("div", "splash-info");
    const brandRow = element("div", "splash-brand");
    const mark = element("div", "splash-mark");
    mark.style.backgroundImage = `url("${address(project.icon)}")`;
    brandRow.append(mark, element("span", "splash-name", ""));
    brandRow.lastChild.append(...nameParts);
    info.append(brandRow, element("span", "splash-tagline", ui("splash.tagline")), element("span", "splash-copyright", ui("copyright")));
    const art = element("div", "splash-art");
    art.style.backgroundImage = `url("${address(sprite.file)}")`;
    art.style.backgroundSize = `${sprite.columns * 100}% ${Math.ceil(sprite.count / sprite.columns) * 100}%`;
    art.style.backgroundPosition = "0% 0%";
    art.append(element("div", "splash-fade"));
    const sheet = element("div", "splash-card");
    sheet.append(info, art);
    body.append(sheet);
  } else {
    body.append(element("div", "preview-bar"));
    const icon = element("div", "preview-icon");
    icon.style.backgroundImage = `url("${address(project.icon)}")`;
    const text = element("div", "preview-text");
    const title = element("div", "preview-name");
    title.append(...nameParts);
    text.append(title, element("div", "preview-description", project.description["en-US"]));
    const footer = element("div", "preview-footer");
    footer.append(element("span", "", `© ${brand.name}`), element("span", "", `kancamu.site/${folder}/`));
    body.append(icon, text, footer);
  }
  card.append(body);
  return card;
}

const dataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
const toDataUrl = async (source) => dataUrl(await (await fetch(source)).blob());

function flatten(source, target) {
  const computed = getComputedStyle(source);
  for (const property of computed) target.style.setProperty(property, computed.getPropertyValue(property));
  [...source.children].forEach((child, index) => flatten(child, target.children[index]));
}

async function cardToPng(card) {
  const stage = element("div", "");
  stage.style.cssText = "position: fixed; left: -10000px; top: 0; width: 1200px;";
  document.body.append(stage);
  try {
    const live = card.cloneNode(true);
    stage.append(live);
    for (const part of [live, ...live.querySelectorAll("*")]) {
      const found = /url\("?([^")]+)"?\)/.exec(part.style.backgroundImage || "");
      if (found) part.style.backgroundImage = `url("${await toDataUrl(found[1])}")`;
    }
    await document.fonts.ready;
    const copy = live.cloneNode(true);
    flatten(live, copy);
    copy.style.width = "1200px"; copy.style.height = "630px";
    const fonts = await Promise.all([400, 700].map(async (weight) => `@font-face { font-family: "Inter"; font-weight: ${weight}; src: url("${await toDataUrl(new URL(`../assets/fonts/inter-latin-${weight}-normal.woff2`, import.meta.url))}") format("woff2"); }`));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${fonts.join("")}</style>${new XMLSerializer().serializeToString(copy)}</div></foreignObject></svg>`;
    const picture = new Image();
    picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await picture.decode();
    const canvas = Object.assign(document.createElement("canvas"), { width: 1200, height: 630 });
    canvas.getContext("2d").drawImage(picture, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG"))), "image/png"));
  } finally {
    stage.remove();
  }
}

function renderPreviews() {
  heading("previews");
  const own = projects.filter((project) => project.publisher === "{brand}");
  own.sort((a, b) => Number(b.id === "kancamu") - Number(a.id === "kancamu") || fill(a.name["en-US"]).localeCompare(fill(b.name["en-US"])));
  sections.previews.body.replaceChildren(element("div", "preview-grid"));
  sections.previews.body.firstChild.append(...own.map((project) => {
    const folder = project.url.replace(/^\.\/?|\/$/g, "");
    const item = element("div", "preview-item");
    const frame = element("div", "preview-frame");
    const card = buildCard({ project, brand: i18n.brand, data: mainData });
    frame.append(card);
    const save = element("button", "");
    save.type = "button";
    save.append(element("span", "icon icon-download"), element("span", "", tr("previews.save")));
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const name = `${project.id}-preview.png`;
        components.download(name, await cardToPng(card));
        popups.toast(tr("previews.saved", { name }));
      } catch (error) {
        popups.toast(tr("previews.failed", { message: error.message }), { kind: "error" });
      } finally {
        save.disabled = false;
      }
    });
    const meta = element("div", "preview-meta");
    meta.append(element("span", "preview-path", `${folder ? folder + "/" : ""}preview.png`), save);
    item.append(frame, meta);
    return item;
  }));
}

const search = element("input");
search.type = "search";
search.setAttribute("data-i18n-placeholder", "icons.search");
search.setAttribute("data-i18n-label", "icons.searchLabel");
search.value = urlState.get("q");
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
    glyph.style.setProperty("--icon", `var(--icon-${name})`);
    tile.append(glyph, element("span", "icon-name", name));
    tile.title = `${name}.svg`;
    tile.addEventListener("click", () => copy(`${name}.svg`));
    return tile;
  }) : [element("span", "empty", tr("icons.none"))]));
}
sections.icons.body.append(searchbox, count, iconGrid);
search.addEventListener("input", () => { urlState.set({ q: search.value.trim() }); renderIcons(); });
autocomplete.attach(search, { suggestions: () => icons });

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
function markSection() {
  const top = $("content").getBoundingClientRect().top + 8;
  let current = sectionOrder[0];
  for (const id of sectionOrder) if (sections[id].box.getBoundingClientRect().top <= top) current = id;
  for (const item of $("sidebar-nav").children) item.classList.toggle("on", item.dataset.section === current);
  if (settled) urlState.set({ section: current === sectionOrder[0] ? "" : current });
}
let settled = false;
$("content").addEventListener("scroll", markSection);

function renderAll() {
  renderSide(); renderColours(); renderApps(); renderPreviews(); renderIcons(); renderFonts(); renderSizes(); renderFiles();
}
renderAll();
i18n.onChange(renderAll);
{
  const wanted = sections[urlState.get("section")];
  const arrive = () => { wanted?.box.scrollIntoView({ block: "start" }); markSection(); settled = true; };
  requestAnimationFrame(() => requestAnimationFrame(arrive));
  document.fonts?.ready.then(() => { if (!settled) arrive(); else if (wanted) wanted.box.scrollIntoView({ block: "start" }); });
}
new MutationObserver(() => { renderColours(); renderApps(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });


account.bind($("account-button"));

if (previewId) {
  const project = projects.find((item) => item.id === previewId && item.publisher === "{brand}");
  if (project) {
    document.body.className = "preview-only";
    document.body.replaceChildren(buildCard({ project, brand: i18n.brand, data: mainData }));
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll("*")].map((part) => {
      const found = /url("?([^")]+)"?)/.exec(part.style.backgroundImage || "");
      if (!found) return null;
      const image = new Image();
      image.src = found[1];
      return image.decode().catch(() => {});
    }));
    document.body.dataset.ready = "true";
  }
}
