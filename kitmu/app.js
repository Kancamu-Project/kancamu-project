// Kitmu: the UI kit of the webs: the components (assets/css/components.css), the helpers (assets/js/components.js), and the popups (assets/js/popup.js), each with the code to copy and a way to try it.
// One section is shown at a time (the one picked in the sidebar, kept in the address as #templates, #helpers, or #popups). Each item of a section is an expandable part, open at first; a template shows its preview, and its code with the buttons Preview and Code.
await i18n.load();
i18n.selects();

const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const { element } = components;
const { popups: popupDocs, items: componentDocs, helpers, guide, sectionOrder } = i18n.data;
const groups = sectionOrder.filter((id) => id !== "guide" && id !== "helpers" && id !== "popups");

/* ---------- the sections: built once, filled again when the language or the theme changes ---------- */
const sections = {};
for (const id of sectionOrder) {
  const box = element("div", "kit-section");
  box.id = `section-${id}`;
  const title = element("span", "section-title");
  const hint = element("span", "section-hint");
  const body = element("div", "group");
  box.append(title, hint, body);
  sections[id] = { box, title, hint, body };
}
$("content").replaceChildren(...sectionOrder.map((id) => sections[id].box));
let current = sectionOrder.includes(location.hash.slice(1)) ? location.hash.slice(1) : sectionOrder[0];
function show(id) {
  current = id;
  for (const key of sectionOrder) sections[key].box.hidden = key !== id;
  for (const item of $("sidebar-nav").children) item.classList.toggle("on", item.dataset.section === id);
  history.replaceState(null, "", `#${id}`);
  $("content").scrollTop = 0;
}
const heading = (id) => {
  sections[id].title.textContent = tr(`section.${id}`);
  sections[id].hint.textContent = tr(`${id}.hint`);
};

/* ---------- an item of a list: its title is the button of an expandable part (like the settings), and what is about it is in the body ---------- */
const closed = new Set();   // the items that were closed, kept when the language or the theme makes the lists again (the others are open)
function item(key, title, ...parts) {
  const box = element("div", "doc-item");
  const toggle = element("button", "section-toggle");
  toggle.type = "button";
  toggle.append(element("span", "", title), components.icon("chevron-down"));
  const body = element("div", "section-body doc-body");
  body.append(...parts);
  components.expand({ toggle, body, open: !closed.has(key) });
  toggle.addEventListener("click", () => (body.hidden ? closed.add(key) : closed.delete(key)));
  box.append(toggle, body);
  return box;
}

/* ---------- templates: each one in a page of its own (so nothing of this web changes it), with the HTML to copy ---------- */
// What makes a demo work: the expandable parts open and close, a toggle stays pressed, and one button of a toggle group is on.
const DEMO_SCRIPT = `
document.querySelectorAll(".section-toggle").forEach((toggle) => !toggle.closest("kit-collapsible") && components.expand({ toggle, body: toggle.nextElementSibling, open: toggle.getAttribute("aria-expanded") !== "false" }));
document.querySelectorAll("button.toggle").forEach((button) => button.addEventListener("click", () => { button.classList.toggle("on"); button.setAttribute("aria-pressed", button.classList.contains("on")); }));
document.querySelectorAll(".segmented-control").forEach((group) => group.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => group.querySelectorAll("button").forEach((other) => other.classList.toggle("on", other === button)))));
`.replaceAll("</", "<\\/");
function demoPage(html, script = "") {
  const style = getComputedStyle(document.documentElement);
  const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><link rel="stylesheet" href="../assets/css/style.css"><link rel="stylesheet" href="../assets/css/components.css"><link rel="stylesheet" href="../assets/css/page.css"><style>:root { --brand: ${style.getPropertyValue("--brand")}; --brand-ink: ${style.getPropertyValue("--brand-ink")}; } .logo-mark { background-image: url(favicon.png); } body { min-height: 0; }</style></head><body>${html}<script src="../assets/js/popup.js"></script><script src="../assets/js/autocomplete.js"></script><script src="../assets/js/components.js"></script><script>${DEMO_SCRIPT}</script>${script ? `<script>${script.replaceAll("</", "<\\/")}</script>` : ""}</body></html>`;
}
const showingCode = new Set();   // the components whose code is shown instead of the preview, kept when the lists are made again
function component(doc) {
  const frame = element("iframe", "doc-frame");
  frame.title = doc.name;
  frame.style.height = `${doc.height}px`;
  frame.srcdoc = demoPage(doc.html, doc.script);
  const code = element("pre", "doc-code", doc.script ? `${doc.html}\n\n<script>\n${doc.script}\n</script>` : doc.html);
  const tabs = element("div", "segmented-control");
  const previewButton = element("button", "", tr("components.preview"));
  const codeButton = element("button", "", tr("components.code"));
  previewButton.type = codeButton.type = "button";
  tabs.append(previewButton, codeButton);
  const select = (showCode) => {
    frame.hidden = showCode;
    code.hidden = !showCode;
    previewButton.classList.toggle("on", !showCode);
    codeButton.classList.toggle("on", showCode);
    (showCode ? showingCode.add(doc.id) : showingCode.delete(doc.id));
  };
  previewButton.addEventListener("click", () => select(false));
  codeButton.addEventListener("click", () => select(true));
  select(showingCode.has(doc.id));
  const note = doc.html.includes("<kit-") ? [element("span", "doc-text", tr("components.tag"))] : [];
  return item(`component.${doc.id}`, doc.name, element("span", "doc-text", tr(`components.${doc.id}.text`)), ...note, tabs, frame, code);
}
function renderGroup(id) {
  heading(id);
  const list = element("div", "doc-list");
  list.append(...componentDocs.filter((doc) => doc.group === id).map(component));
  sections[id].body.replaceChildren(list);
}

/* ---------- the guide: how a web uses Kitmu, one step after another, with the code to copy ---------- */
function renderGuide() {
  heading("guide");
  const list = element("div", "doc-list");
  list.append(...guide.map((step) => item(`guide.${step.id}`, tr(`guide.${step.id}.title`), element("span", "doc-text", tr(`guide.${step.id}.text`)), ...(step.code ? [element("pre", "doc-code", step.code)] : []))));
  sections.guide.body.replaceChildren(list);
}

/* ---------- helpers: the small scripts of components.js, with the code and what it gives ---------- */
const helperResult = { format: () => `${components.formatSize(1536000)} · ${components.extensionOf("Photo.PNG")}` };
function renderHelpers() {
  heading("helpers");
  const list = element("div", "doc-list");
  list.append(...helpers.map((helper) => {
    const parts = [element("span", "doc-text", tr(`helpers.${helper.id}.text`)), element("pre", "doc-code", helper.code)];
    if (helperResult[helper.id]) parts.push(element("span", "doc-text", `${tr("helpers.result")}: ${helperResult[helper.id]()}`));
    return item(`helper.${helper.id}`, tr(`helpers.${helper.id}.title`), ...parts);
  }));
  sections.helpers.body.replaceChildren(list);
}

/* ---------- popups: how each one is used, with the code and a button that tries it ---------- */
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
function renderPopups() {
  heading("popups");
  const list = element("div", "doc-list");
  list.append(...popupDocs.map((doc) => {
    const run = element("button", "popup-try", tr("popups.try"));
    run.type = "button";
    run.addEventListener("click", demos[doc.id]);
    return item(`popup.${doc.id}`, tr(`popups.${doc.id}.title`), element("span", "doc-text", tr(`popups.${doc.id}.text`)), element("pre", "doc-code", doc.code), run);
  }));
  sections.popups.body.replaceChildren(list);
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
    item.addEventListener("click", () => { menu.set(false); show(id); });
    return item;
  }));
  for (const item of $("sidebar-nav").children) item.classList.toggle("on", item.dataset.section === current);
}

function renderAll() {
  renderSide(); renderGuide(); groups.forEach(renderGroup); renderHelpers(); renderPopups();
  for (const key of sectionOrder) sections[key].box.hidden = key !== current;
}
renderAll();
window.addEventListener("hashchange", () => { if (sectionOrder.includes(location.hash.slice(1))) show(location.hash.slice(1)); });
i18n.onChange(renderAll);
// The demos of the templates follow the theme: when it changes (here, or in another web), they are made again.
new MutationObserver(() => groups.forEach(renderGroup)).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// One button toggles the theme, to see the kit in both of them; its icon is the theme that a click gives (a sun in the dark theme).
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
