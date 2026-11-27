import { i18n, popups, account, urlState, components } from "../assets/js/shared.js";
import appData from "./data.js";

await i18n.load(appData);
i18n.selects();

const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const { element } = components;
const { popups: popupDocs, items: componentDocs, helpers, guide, tags: tagDocs } = i18n.data;
const { pages } = i18n.data;
const views = ["components", "pages", "guide", "helpers", "popups"];
const single = new Set(["pages", "guide"]);

const params = new URLSearchParams(location.search);
const filter = { q: params.get("q") || "", tag: tagDocs[params.get("tag")] ? params.get("tag") : "all" };
const filtering = () => filter.q.trim() !== "" || filter.tag !== "all";
const tagLabel = (key) => (tagDocs[key] ? i18n.pick(tagDocs[key]) : key);
let view = views.includes(params.get("view")) ? params.get("view") : "components";
function save() {
  urlState.set({ q: filter.q, tag: filter.tag === "all" ? "" : filter.tag, view: view === "components" ? "" : view });
}

const boxes = {};
for (const id of views) {
  const box = element("div", "kit-section");
  box.id = `section-${id}`;
  const hint = element("span", "section-hint");
  const body = element("div", `doc-grid${single.has(id) ? " single" : ""}`);
  box.append(...(id === "components" ? [body] : [hint, body]));
  boxes[id] = { box, hint, body };
}
$("content").replaceChildren(...views.map((id) => boxes[id].box), $("no-results"));

const showingCode = new Set();
function card(key, title, chips, { preview, code = null }) {
  const box = element("div", "doc-card");
  const head = element("div", "doc-head");
  head.append(element("span", "doc-title", title));
  const previewPane = element("div", "doc-pane");
  previewPane.append(...preview);
  box.append(head);
  if (chips.length) {
    const row = element("div", "doc-tags");
    row.append(...chips.map((tag) => { const chip = element("span", "tag", tagLabel(tag)); chip.dataset.tag = tag; return chip; }));
    box.append(row);
  }
  box.append(previewPane);
  if (code) {
    const codePane = element("div", "doc-pane");
    codePane.append(...code);
    const tabs = element("div", "segmented-control");
    const previewButton = element("button", "", tr("components.preview"));
    const codeButton = element("button", "", tr("components.code"));
    previewButton.type = codeButton.type = "button";
    tabs.append(previewButton, codeButton);
    const select = (showCode) => {
      previewPane.hidden = showCode;
      codePane.hidden = !showCode;
      previewButton.classList.toggle("on", !showCode);
      codeButton.classList.toggle("on", showCode);
      (showCode ? showingCode.add(key) : showingCode.delete(key));
    };
    previewButton.addEventListener("click", () => select(false));
    codeButton.addEventListener("click", () => select(true));
    select(showingCode.has(key));
    head.append(tabs);
    box.append(codePane);
  }
  return box;
}

const DEMO_SCRIPT = `
document.querySelectorAll(".section-toggle").forEach((toggle) => !toggle.closest("kit-collapsible") && components.expand({ toggle, body: toggle.nextElementSibling, open: toggle.getAttribute("aria-expanded") !== "false" }));
document.querySelectorAll("button.toggle").forEach((button) => button.addEventListener("click", () => { button.classList.toggle("on"); button.setAttribute("aria-pressed", button.classList.contains("on")); }));
document.querySelectorAll(".segmented-control").forEach((group) => group.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => group.querySelectorAll("button").forEach((other) => other.classList.toggle("on", other === button)))));
`.replaceAll("</", "<\\/");
function demoPage(html, script = "") {
  const style = getComputedStyle(document.documentElement);
  const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><link rel="stylesheet" href="../assets/css/shared.css"><style>:root { --brand: ${style.getPropertyValue("--brand")}; --brand-ink: ${style.getPropertyValue("--brand-ink")}; } .logo-mark { background-image: url(favicon.png); } body { min-height: 0; }</style></head><body class="page">${html}<script type="module">import { popups, autocomplete, components } from "../assets/js/shared.js"; Object.assign(window, { popups, autocomplete, components });</script><script type="module">${DEMO_SCRIPT}</script>${script ? `<script type="module">${script.replaceAll("</", "<\\/")}</script>` : ""}</body></html>`;
}
function component(doc) {
  const frame = element("iframe", "doc-frame");
  frame.title = doc.name;
  frame.style.height = `${doc.height}px`;
  frame.srcdoc = demoPage(doc.html, doc.script);
  const note = doc.html.includes("<kit-") ? [element("span", "doc-text", tr("components.tag"))] : [];
  const code = element("pre", "doc-code", doc.script ? `${doc.html}\n\n<script>\n${doc.script}\n</script>` : doc.html);
  return card(`component.${doc.id}`, doc.name, doc.tags ?? [], { preview: [frame], code: [element("span", "doc-text", tr(`components.${doc.id}.text`)), ...note, code] });
}

const guideItem = (step) => card(`guide.${step.id}`, tr(`guide.${step.id}.title`), [], { preview: [element("span", "doc-text", tr(`guide.${step.id}.text`))], code: step.code ? [element("pre", "doc-code", step.code)] : null });

const helperResult = { format: () => `${components.formatSize(1536000)} · ${components.extensionOf("Image.PNG")}` };
function helperItem(helper) {
  const preview = [element("span", "doc-text", tr(`helpers.${helper.id}.text`))];
  if (helperResult[helper.id]) preview.push(element("span", "doc-text", `${tr("helpers.result")}: ${helperResult[helper.id]()}`));
  return card(`helper.${helper.id}`, tr(`helpers.${helper.id}.title`), [], { preview, code: [element("pre", "doc-code", helper.code)] });
}

const demos = {
  toast: () => popups.toast(tr("demo.copied")),
  toastInfo: () => popups.toast(tr("demo.syncing"), { kind: "info" }),
  toastWarning: () => popups.toast(tr("demo.skipped"), { kind: "warning" }),
  toastError: () => popups.toast(tr("demo.failed"), { kind: "error" }),
  toastHold: () => {
    const note = popups.toast(tr("demo.working"), { kind: "info", duration: 0 });
    setTimeout(() => note.set(tr("demo.stillWorking")), 1200);
    setTimeout(() => note.close(), 2600);
  },
  toastProgress: () => {
    const total = 9;
    let done = 0;
    const bar = popups.toast(tr("demo.uploading", { done, total }), { duration: 0, progress: 0 });
    const timer = setInterval(() => {
      done++;
      bar.set(tr("demo.uploading", { done, total }), done / total);
      if (done === total) { clearInterval(timer); setTimeout(() => bar.close(), 600); }
    }, 350);
  },
  tell: () => popups.tell({ text: tr("demo.saved") }),
  sheet: () => popups.sheet({ title: tr("demo.sheetTitle"), text: tr("demo.sheetText"), side: "end" }),
  drawer: () => popups.sheet({ title: tr("demo.drawerTitle"), text: tr("demo.drawerText"), side: "bottom" }),
  command: async () => popups.toast(tr("demo.answer", { answer: String(await popups.command({ items: [{ label: tr("demo.open"), hint: "Ctrl O", value: "open" }, { label: tr("demo.save"), hint: "Ctrl S", value: "save" }, { label: tr("demo.delete"), value: "delete" }] })) })),
  ask: async () => popups.toast(tr("demo.answer", { answer: String(await popups.ask({ text: tr("demo.question"), ok: tr("demo.delete"), kind: "error" })) })),
  askText: async () => popups.toast(tr("demo.answer", { answer: String(await popups.ask({ text: tr("demo.name"), value: tr("demo.oldName") })) })),
};
function popupItem(doc) {
  const run = element("button", "popup-try", tr("popups.try"));
  run.type = "button";
  run.addEventListener("click", demos[doc.id]);
  return card(`popup.${doc.id}`, tr(`popups.${doc.id}.title`), [], { preview: [element("span", "doc-text", tr(`popups.${doc.id}.text`)), run], code: [element("pre", "doc-code", doc.code)] });
}

const entries = [...componentDocs].sort((a, b) => a.name.localeCompare(b.name)).map((doc) => ({
  tags: doc.tags,
  title: () => doc.name,
  text: () => tr(`components.${doc.id}.text`),
  code: doc.html,
  make: () => component(doc),
}));
function matches(entry) {
  if (filter.tag !== "all" && !entry.tags.includes(filter.tag)) return false;
  const words = filter.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${entry.title()} ${entry.text()} ${entry.tags.map(tagLabel).join(" ")} ${entry.code}`.toLowerCase();
  return words.every((word) => text.includes(word));
}
function applyFilter() {
  let count = 0;
  for (const entry of entries) {
    if (!entry.node) continue;
    const match = matches(entry);
    entry.node.hidden = !match;
    if (match) count++;
  }
  for (const chip of document.querySelectorAll(".doc-tags .tag")) chip.classList.toggle("on", chip.dataset.tag === filter.tag);
  for (const button of $("tag-filter").children) button.classList.toggle("on", button.dataset.tag === filter.tag);
  $("no-results").hidden = view !== "components" || count > 0;
  $("reset-button").hidden = !filtering();
  if ($("kit-search").value !== filter.q) $("kit-search").value = filter.q;
}
function renderFilters() {
  const keys = Object.keys(tagDocs).filter((key) => entries.some((entry) => entry.tags.includes(key))).sort((a, b) => tagLabel(a).localeCompare(tagLabel(b), i18n.lang));
  $("tag-filter").replaceChildren(...["all", ...keys].map((key) => {
    const button = element("button", "", key === "all" ? tr("all") : tagLabel(key));
    button.type = "button";
    button.dataset.tag = key;
    button.addEventListener("click", () => { filter.tag = key; save(); applyFilter(); });
    return button;
  }));
}
let typing;
$("kit-search").addEventListener("input", () => {
  clearTimeout(typing);
  typing = setTimeout(() => { filter.q = $("kit-search").value; save(); applyFilter(); $("content").scrollTop = 0; }, 150);
});
$("reset-button").addEventListener("click", () => { filter.q = ""; filter.tag = "all"; save(); applyFilter(); });

function renderTabs() {
  const buttons = views.map((id) => { const button = element("button", "", tr(`section.${id}`)); button.setAttribute("value", id); button.type = "button"; return button; });
  const tabs = components.make("tabs", { value: view }, buttons);
  tabs.addEventListener("change", (event) => { view = event.detail.value; save(); showView(); });
  $("views").replaceChildren(tabs);
  requestAnimationFrame(() => requestAnimationFrame(() => tabs.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "nearest" })));
  document.fonts?.ready.then(() => tabs.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "nearest" }));
}
function showView() {
  for (const id of views) boxes[id].box.hidden = id !== view;
  $("toolbar").hidden = view !== "components";
  $("content").scrollTop = 0;
  applyFilter();
}
function renderBodies() {
  for (const entry of entries) entry.node = entry.make();
  boxes.components.body.replaceChildren(...entries.map((entry) => entry.node));
  for (const id of ["pages", "guide", "helpers", "popups"]) boxes[id].hint.textContent = tr(`${id}.hint`);
  boxes.pages.body.replaceChildren(...pages.map(component));
  boxes.guide.body.replaceChildren(...guide.map(guideItem));
  boxes.helpers.body.replaceChildren(...helpers.map(helperItem));
  boxes.popups.body.replaceChildren(...popupDocs.map(popupItem));
}

function renderAll() {
  renderTabs(); renderFilters(); renderBodies();
  showView();
}
renderAll();
i18n.onChange(renderAll);
new MutationObserver(() => { for (const entry of entries) entry.node = entry.make(); boxes.components.body.replaceChildren(...entries.map((entry) => entry.node)); applyFilter(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

function markTheme() {
  const light = document.documentElement.dataset.theme === "light";
  const icon = $("theme-button").querySelector(".icon");
  icon.classList.toggle("icon-sun", !light);
  icon.classList.toggle("icon-moon", light);
}
$("theme-button").addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("theme", theme); } catch { }
});
new MutationObserver(markTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
window.addEventListener("storage", (event) => { if (event.key === "theme" || event.key === null) markTheme(); });
markTheme();

account.bind($("account-button"));
