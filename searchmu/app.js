// Searchmu: the advanced search of Google. The fields make a query (the words, the exact phrase, the words to leave out, a range of numbers, a site, a type of file) and the filters of Google
// (the language, the region, the last update, the usage rights, SafeSearch), and the results of Google are shown in a frame beside the fields. Nothing goes to Kancamu: the frame is Google's own page.
// What the user types in the fields is never in the address: only the tab of a narrow window is.

await i18n.load();
i18n.selects();

const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "main", "views", "filters", "all", "exact", "any", "none", "from", "to", "language", "region", "updated", "site", "terms", "filetype", "rights", "num", "safe",
  "query", "reset-button", "copy-button", "search-button", "open-button", "frame", "frame-empty",
  "status", "account-button"
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

// The languages, the regions, the types of file, the rights, and the limits are in data.js.
const { searchLanguages, regions, filetypes, rights, limits, settings: { defaults } } = i18n.data;
const VIEWS = ["filters", "results"];
const preferences = () => settings.get("searchmu", defaults);
const keep = (patch) => settings.set("searchmu", { ...preferences(), ...patch });   // a change of the page is a setting too (the account web shows it)
const narrow = matchMedia("(max-width: 48rem)");

const state = {
  view: VIEWS.includes(urlState.get("view")) ? urlState.get("view") : VIEWS[0],   // the tab of a narrow window
  url: "",   // the address of the last search, as Google has it
};

const say = components.status(els.status);
const toast = (text, kind) => popups.toast(text, kind ? { kind } : undefined);
const fail = (text) => toast(text, "error");
const copy = async (text) => {
  try { await navigator.clipboard.writeText(text); toast(tr("toast.copied")); } catch (error) { fail(tr("error.failed", { message: error.message })); }
};

/* ---------- the query that the fields make ---------- */
const words = (text) => text.match(/"[^"]*"|[^\s,]+/g) || [];
const hostOf = (text) => text.trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
const UPDATED = { d: "qdr:d", w: "qdr:w", m: "qdr:m", y: "qdr:y" };
const OPERATORS = { title: "intitle:", body: "intext:", url: "inurl:", links: "inanchor:" };   // where the words must appear (the operator goes before each word, so the other operators of the query still work)

// The text of the query (q) and the filters of Google (the other parts of its address)
function build() {
  const parts = [];
  const where = OPERATORS[els.terms.value] || "";
  parts.push(...words(els.all.value).map((word) => where + word));
  const exact = els.exact.value.trim().replace(/"/g, "");
  if (exact) parts.push(`${where}"${exact}"`);
  const any = words(els.any.value);
  if (any.length === 1) parts.push(any[0]);
  else if (any.length > 1) parts.push(`(${any.join(" OR ")})`);
  parts.push(...words(els.none.value).map((word) => `-${word}`));
  const from = els.from.value.trim();
  const to = els.to.value.trim();
  if (from && to) parts.push(`${from}..${to}`);
  else if (from || to) parts.push(from || to);
  const site = hostOf(els.site.value);
  if (site) parts.push(`site:${site}`);
  if (els.filetype.value) parts.push(`filetype:${els.filetype.value}`);
  const q = parts.join(" ");

  const params = new URLSearchParams();
  params.set("q", q);
  params.set("hl", i18n.lang.split("-")[0] === "zh" ? i18n.lang : i18n.lang.split("-")[0]);   // the language of the page of Google: the one of this page
  if (els.language.value) params.set("lr", els.language.value);
  if (els.region.value) params.set("cr", `country${els.region.value}`);
  if (els.updated.value) params.set("tbs", UPDATED[els.updated.value]);
  if (els.rights.value) params.set("as_rights", els.rights.value);
  if (els.safe.checked) params.set("safe", "active");
  if (els.num.value && els.num.value !== "10") params.set("num", els.num.value);
  return { q, url: `https://www.google.com/search?${params}` };
}

function drawQuery() {
  const { q } = build();
  els.query.textContent = q || tr("query.empty");
  els.query.classList.toggle("empty", !q);
}

/* ---------- the search ---------- */
function showView(view) {
  state.view = view;
  els.main.dataset.view = view;
  const tabs = els.views.firstElementChild;
  if (tabs && tabs.value !== view) tabs.value = view;   // the tabs show the view (a search shows the results)
  if (narrow.matches) urlState.set({ view });
  say(tr(`status.${view}`));
}

function search(event) {
  event.preventDefault();
  const { q, url } = build();
  if (!q) { fail(tr("error.empty")); els.all.focus(); return; }
  state.url = url;
  els.frame.src = `${url}&igu=1`;   // igu=1: the page of the results that Google lets a frame show
  els.frame.classList.remove("hidden");
  els.frameEmpty.classList.add("hidden");
  els.openButton.disabled = false;
  if (narrow.matches) showView("results");
}
els.filters.addEventListener("submit", search);
els.filters.addEventListener("input", drawQuery);
els.filters.addEventListener("change", drawQuery);

els.openButton.addEventListener("click", () => { if (state.url) window.open(state.url, "_blank", "noopener"); });
els.copyButton.addEventListener("click", () => {
  const { q } = build();
  if (!q) return fail(tr("error.empty"));
  copy(q);
});
els.resetButton.addEventListener("click", () => {
  for (const field of [els.all, els.exact, els.any, els.none, els.from, els.to, els.site]) field.value = "";
  for (const field of [els.region, els.updated, els.terms, els.filetype, els.rights]) field.value = "";
  applyPreferences();
  drawQuery();
  els.all.focus();
});

/* ---------- the fields that follow the settings ---------- */
function applyPreferences() {
  const preference = preferences();
  els.language.value = preference.language;
  els.safe.checked = !!preference.safe;
  els.num.value = preference.num;
}
els.language.addEventListener("change", () => keep({ language: els.language.value }));
els.safe.addEventListener("change", () => keep({ safe: els.safe.checked }));
els.num.addEventListener("change", () => keep({ num: els.num.value }));
settings.onChange("searchmu", defaults, () => { applyPreferences(); drawQuery(); });   // the account web changes a setting: the page shows it

/* ---------- the page ---------- */
const option = (value, text) => Object.assign(document.createElement("option"), { value, textContent: text });
function fillSelect(select, options) {
  const value = select.value;
  select.replaceChildren(...options.map(([optionValue, text]) => option(optionValue, text)));
  select.value = options.some(([optionValue]) => optionValue === value) ? value : options[0][0];
}
function buildSelects() {
  const any = tr("option.any");
  const regionNames = new Intl.DisplayNames([i18n.lang], { type: "region" });   // the names of the regions are in the language of the page
  const sortedRegions = regions.map((code) => [code, regionNames.of(code)]).sort((a, b) => a[1].localeCompare(b[1], i18n.lang));
  fillSelect(els.language, [["", any], ...searchLanguages.map((language) => [language.value, language.name])]);
  fillSelect(els.region, [["", any], ...sortedRegions]);
  fillSelect(els.updated, [["", tr("updated.any")], ...Object.keys(UPDATED).map((id) => [id, tr(`updated.${id}`)])]);
  fillSelect(els.terms, [["", tr("terms.any")], ...["title", "body", "url", "links"].map((id) => [id, tr(`terms.${id}`)])]);
  fillSelect(els.filetype, [["", any], ...filetypes.map((type) => [type, `.${type}`])]);
  fillSelect(els.rights, rights.map((item) => [item.value, tr(`rights.${item.id}`)]));
  fillSelect(els.num, limits.numbers.map((number) => [number, i18n.number(Number(number))]));
  applyPreferences();
}

function renderTabs() {
  const buttons = VIEWS.map((id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("value", id);
    button.textContent = tr(`tab.${id}`);
    return button;
  });
  const tabs = components.make("tabs", { value: state.view }, buttons);
  tabs.addEventListener("change", (event) => showView(event.detail.value));
  els.views.replaceChildren(tabs);
}

account.bind(els.accountButton);   // the profile and the settings are in the account web

function renderTexts() {
  renderTabs();
  buildSelects();
  drawQuery();
  showView(narrow.matches ? state.view : VIEWS[0]);
}
i18n.onChange(renderTexts);
narrow.addEventListener("change", () => showView(narrow.matches ? state.view : VIEWS[0]));
renderTexts();
