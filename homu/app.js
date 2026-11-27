import { i18n, popups, account, settings, urlState, autocomplete, components } from "../assets/js/shared.js";
import appData from "./data.js";

await i18n.load(appData);

const KEY = "homu.bookmarks";
const HISTORY_KEY = "homu.history";
const QUERY_LIMIT = 500;
const MINUTE = 60000;
const { engines, openTargets, hourCycles, clock, greetings, historyLimit, settings: { defaults } } = i18n.data;
const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(["search-form", "query", "engine-select", "bookmarks", "status", "account-button", "clock", "clock-time", "clock-date", "clock-greeting"].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

const preferences = () => settings.get("homu", defaults);
const keep = (patch) => settings.set("homu", { ...preferences(), ...patch });
const say = components.status(els.status);
const toast = (text, kind) => popups.toast(text, kind ? { kind } : undefined);

const read = () => {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.url === "string")
      .map((item) => ({ ...item, group: typeof item.group === "string" ? item.group : "" }));
  } catch {
    return [];
  }
};
const readHistory = () => {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
};
let bookmarks = read();
let history = readHistory();
let dragged = null;
let clockTimer = 0;

const write = (list) => {
  bookmarks = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (error) {
    toast(tr("error.failed", { message: error.message }), "error");
  }
  render();
};

const normalize = (text) => {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return /^https?:$/.test(url.protocol) && url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
};
const hostOf = (url) => new URL(url).hostname.replace(/^www\./, "");
const target = () => (openTargets.find((item) => item.id === preferences().openIn) ?? openTargets[0]).target;
const groupNames = () => [...new Set(bookmarks.map((item) => item.group).filter(Boolean))];
const filtering = () => els.query.value.trim() !== "";
const remembered = () => (preferences().history ? history : []);

function remember(text) {
  if (!preferences().history) return;
  history = [text, ...history.filter((item) => item.toLowerCase() !== text.toLowerCase())].slice(0, historyLimit);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function go(url) {
  const link = document.createElement("a");
  link.href = url;
  link.target = target();
  link.rel = "noopener noreferrer";
  link.click();
}

function search(event) {
  event.preventDefault();
  const text = els.query.value.trim();
  if (!text) {
    els.query.focus();
    return;
  }
  const engine = engines.find((item) => item.id === preferences().engine) ?? engines[0];
  const address = normalize(text);
  if (!address) remember(text);
  go(address ?? engine.url.replace("{query}", encodeURIComponent(text)));
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(tr("toast.copied"));
  } catch (error) {
    toast(tr("error.failed", { message: error.message }), "error");
  }
}

async function remove(item) {
  if (!(await popups.ask({ text: tr("confirm.delete", { title: item.title }), ok: tr("menu.delete") }))) return;
  write(bookmarks.filter((entry) => entry.id !== item.id));
  toast(tr("toast.deleted"));
}

function move(id, beforeId, group) {
  const item = bookmarks.find((entry) => entry.id === id);
  if (!item) return;
  const rest = bookmarks.filter((entry) => entry.id !== id);
  let index = beforeId ? rest.findIndex((entry) => entry.id === beforeId) : -1;
  if (index < 0) {
    const last = rest.map((entry, position) => [entry, position]).filter(([entry]) => entry.group === group).pop();
    index = last ? last[1] + 1 : rest.length;
  }
  rest.splice(index, 0, { ...item, group });
  write(rest);
}

function shift(item, step) {
  const siblings = bookmarks.filter((entry) => entry.group === item.group);
  const neighbour = siblings[siblings.indexOf(item) + step];
  if (!neighbour) return;
  const list = [...bookmarks];
  const from = list.indexOf(item);
  const to = list.indexOf(neighbour);
  [list[from], list[to]] = [list[to], list[from]];
  write(list);
}

function openForm(item) {
  const form = document.createElement("form");
  form.className = "bookmark-form";
  const title = components.element("input");
  title.type = "text";
  title.value = item?.title ?? "";
  title.autocomplete = "off";
  const address = components.element("input");
  address.type = "text";
  address.value = item?.url ?? "";
  address.autocomplete = "off";
  address.spellcheck = false;
  address.dir = "ltr";
  const group = components.element("input");
  group.type = "text";
  group.value = item?.group ?? "";
  group.autocomplete = "off";
  autocomplete.attach(group, { suggestions: groupNames });
  const save = components.element("button", "primary");
  save.type = "submit";
  save.append(components.icon("check"), components.element("span", "", tr("action.save")));
  form.append(
    components.make("field", { label: tr("field.title"), hint: tr("field.title.hint") }, [title]),
    components.make("field", { label: tr("field.address"), hint: tr("field.address.hint") }, [address]),
    components.make("field", { label: tr("field.group"), hint: tr("field.group.hint") }, [group]),
    save
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = normalize(address.value);
    if (!url) {
      toast(tr("error.address"), "warning");
      address.focus();
      return;
    }
    if (bookmarks.some((entry) => entry.url === url && entry.id !== item?.id)) {
      toast(tr("error.exists"), "warning");
      return;
    }
    const entry = { id: item?.id ?? crypto.randomUUID(), title: title.value.trim() || hostOf(url), url, group: group.value.trim() };
    write(item ? bookmarks.map((current) => (current.id === item.id ? entry : current)) : [...bookmarks, entry]);
    toast(tr(item ? "toast.saved" : "toast.added"));
    form.closest("dialog")?.close();
  });
  popups.sheet({ title: tr(item ? "form.edit" : "form.add"), node: form, side: "end" });
}

function bookmarkTile(item) {
  const tile = components.element("div", "bookmark");
  const link = components.element("a", "bookmark-link");
  link.href = item.url;
  link.target = target();
  link.rel = "noopener noreferrer";
  link.draggable = false;
  const text = components.element("span", "bookmark-text");
  text.append(components.element("span", "bookmark-title", item.title), components.element("span", "bookmark-host", hostOf(item.url)));
  link.append(components.element("span", "bookmark-mark", [...item.title][0] ?? ""), text);
  const more = components.element("button", "bookmark-more square");
  more.type = "button";
  more.title = tr("bookmark.more", { title: item.title });
  more.setAttribute("aria-label", more.title);
  more.append(components.icon("more"));
  const siblings = bookmarks.filter((entry) => entry.group === item.group);
  more.addEventListener("click", () => components.menu({
    anchor: more,
    align: "end",
    items: [
      { label: tr("menu.openNew"), icon: "external", onSelect: () => window.open(item.url, "_blank", "noopener") },
      { label: tr("menu.copy"), icon: "copy", onSelect: () => copy(item.url) },
      { label: tr("menu.edit"), icon: "pencil", onSelect: () => openForm(item) },
      { separator: true },
      { label: tr("menu.earlier"), icon: "arrow-up", disabled: siblings[0] === item, onSelect: () => shift(item, -1) },
      { label: tr("menu.later"), icon: "arrow-down", disabled: siblings[siblings.length - 1] === item, onSelect: () => shift(item, 1) },
      { separator: true },
      { label: tr("menu.delete"), icon: "trash", danger: true, onSelect: () => remove(item) },
    ],
  }));
  tile.draggable = !filtering();
  tile.addEventListener("dragstart", (event) => {
    dragged = item.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    tile.classList.add("dragging");
  });
  tile.addEventListener("dragend", () => {
    dragged = null;
    tile.classList.remove("dragging");
    document.querySelectorAll(".drop-target").forEach((node) => node.classList.remove("drop-target"));
  });
  tile.addEventListener("dragover", (event) => {
    if (!dragged || dragged === item.id) return;
    event.preventDefault();
    event.stopPropagation();
    tile.classList.add("drop-target");
  });
  tile.addEventListener("dragleave", () => tile.classList.remove("drop-target"));
  tile.addEventListener("drop", (event) => {
    if (!dragged || dragged === item.id) return;
    event.preventDefault();
    event.stopPropagation();
    move(dragged, item.id, item.group);
  });
  tile.append(link, more);
  return tile;
}

function addTile() {
  const tile = components.element("button", "bookmark-add");
  tile.type = "button";
  tile.append(components.icon("plus"), components.element("span", "", tr("action.add")));
  tile.addEventListener("click", () => openForm());
  return tile;
}

function groupSection(name, items, extra) {
  const section = components.element("div", "bookmark-group");
  if (name) section.append(components.element("span", "bookmark-group-title", name));
  const list = components.element("div", "bookmark-list");
  list.append(...items.map(bookmarkTile), ...extra);
  list.addEventListener("dragover", (event) => {
    if (!dragged) return;
    event.preventDefault();
    list.classList.add("drop-target");
  });
  list.addEventListener("dragleave", (event) => {
    if (!list.contains(event.relatedTarget)) list.classList.remove("drop-target");
  });
  list.addEventListener("drop", (event) => {
    if (!dragged) return;
    event.preventDefault();
    move(dragged, null, name);
  });
  section.append(list);
  return section;
}

function render() {
  const text = els.query.value.trim().toLowerCase();
  const shown = text ? bookmarks.filter((item) => `${item.title} ${item.url} ${item.group}`.toLowerCase().includes(text)) : bookmarks;
  const names = ["", ...new Set(shown.map((item) => item.group).filter(Boolean))];
  els.bookmarks.classList.toggle("empty", !bookmarks.length);
  els.bookmarks.replaceChildren(...names.map((name) => groupSection(name, shown.filter((item) => item.group === name), name ? [] : [addTile()])));
  if (text) say(tr("status.query", { n: i18n.number(shown.length) }));
  else say(bookmarks.length ? tr("status.count", { n: i18n.number(bookmarks.length) }) : tr("status.empty"));
}

function renderEngines() {
  els.engineSelect.replaceChildren(...engines.map((engine) => Object.assign(document.createElement("option"), { value: engine.id, textContent: tr(`engine.${engine.id}`) })));
  els.engineSelect.value = preferences().engine;
}

function drawClock() {
  const preference = preferences();
  els.clock.hidden = !preference.clock;
  els.clockGreeting.hidden = !preference.greeting;
  clearTimeout(clockTimer);
  if (!preference.clock) return;
  const now = new Date();
  const cycle = hourCycles.find((item) => item.id === preference.hourCycle) ?? hourCycles[0];
  els.clockTime.textContent = new Intl.DateTimeFormat(i18n.lang, { ...clock.time, hour12: cycle.hour12 }).format(now);
  els.clockDate.textContent = new Intl.DateTimeFormat(i18n.lang, clock.date).format(now);
  els.clockGreeting.textContent = tr(`greeting.${greetings.filter((item) => item.from <= now.getHours()).pop().id}`);
  clockTimer = setTimeout(drawClock, MINUTE - (now.getTime() % MINUTE));
}

function refresh() {
  bookmarks = read();
  render();
}

function redraw() {
  renderEngines();
  render();
  drawClock();
}

els.searchForm.addEventListener("submit", search);
els.engineSelect.addEventListener("change", () => keep({ engine: els.engineSelect.value }));
els.query.value = urlState.get("q");
els.query.addEventListener("input", () => {
  urlState.set({ q: els.query.value.length <= QUERY_LIMIT ? els.query.value : "" });
  render();
});
autocomplete.attach(els.query, {
  onEmpty: true,
  suggestions: (query) => (query ? [...remembered(), ...bookmarks.map((item) => item.title)] : remembered()),
});
account.bind(els.accountButton);

document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
  if (document.activeElement?.closest("input, textarea, select, [contenteditable]")) return;
  event.preventDefault();
  els.query.focus();
});
settings.onChange("homu", defaults, redraw);
settings.listen("homu", (message) => {
  if (message.type === "bookmarksChanged") refresh();
  if (message.type === "historyChanged") history = readHistory();
});
window.addEventListener("storage", (event) => {
  if (event.key === KEY || event.key === null) refresh();
  if (event.key === HISTORY_KEY || event.key === null) history = readHistory();
});
i18n.onChange(redraw);

redraw();
if (!matchMedia("(pointer: coarse)").matches) els.query.focus();
