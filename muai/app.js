import { i18n, popups, account, autocomplete, settings, storage, urlState, components } from "../assets/js/shared.js";
import appData from "./data.js";

try {
  const w = parseFloat(JSON.parse(localStorage.getItem("muai.settings")).sideWidth);
  if (w >= 16 && w <= 40) document.documentElement.style.setProperty("--sidebar-width", w.toFixed(1) + "rem");
} catch {}

import {
  AutoProcessor,
  AutoTokenizer,
  AutoModelForCausalLM,
  Gemma4ForConditionalGeneration,
  Gemma4Processor,
  TextStreamer,
  InterruptableStoppingCriteria,
  load_image,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

env.allowLocalModels = false;

await i18n.load(appData);
i18n.selects();
const tr = (key, params) => i18n.t(key, params);

const { models: MODELS, settings: { defaults: DEFAULTS } } = i18n.data;
const sizeLabel = (mb) => (mb >= 1000 ? (mb / 1000).toFixed(1) + " GB" : mb + " MB");
const CONNECTION_KEY = "muai.connection";
const NO_CONNECTION = { baseUrl: "", apiKey: "", model: "", helperUrl: "", helperToken: "", writeMode: "task" };
const WRITE_MODES = ["each", "task", "never"];
const readConnection = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(CONNECTION_KEY)) || {};
    if (!saved.writeMode && "askWrites" in saved) saved.writeMode = saved.askWrites ? "each" : "never";
    return { ...NO_CONNECTION, ...saved, writeMode: WRITE_MODES.includes(saved.writeMode) ? saved.writeMode : NO_CONNECTION.writeMode };
  } catch { return { ...NO_CONNECTION }; }
};
let connection = readConnection();
const apiReady = () => !!(connection.baseUrl.trim() && connection.model.trim());
const helperReady = () => !!(connection.helperUrl.trim() && connection.helperToken.trim());
const agentReady = () => helperReady() && !!helperInfo?.folder;
const apiDef = () => ({ id: "api", name: connection.model, kind: "api", mb: 0 });
const chosenId = settings.get("muai", DEFAULTS).model;

let MODEL = chosenId === "api" ? (apiReady() ? apiDef() : null) : MODELS.find((m) => m.id === chosenId) || null;

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "model-picker","connection-button","helper-button","folder-button","folder-label","chat","message-input",
  "send-button","stop-button","chat-area","attach-button","image-file-input","attachment-preview","attachment-preview-image","attachment-preview-name","remove-attachment-button","chat-list","chat-search",
  "new-chat-button","chat-title","export-button","menu-button",
  "sidebar-overlay","main","welcome-message","sidebar","sidebar-resizer",
].map((id) => [id.replace(/-([a-z])/g, (m, c) => c.toUpperCase()), $(id)]));
function renderModelPicker(label) {
  const options = MODELS.map((m) => {
    const option = document.createElement("option");
    option.value = m.id; option.textContent = `${m.name} (${sizeLabel(m.mb)})`;
    return option;
  });
  options.push(Object.assign(document.createElement("option"), { value: "api", textContent: apiReady() ? tr("model.api", { name: connection.model }) : tr("model.apiSetup") }));
  if (!MODEL) {
    const ask = document.createElement("option");
    ask.value = ""; ask.textContent = tr("model.select");
    options.unshift(ask);
  }
  els.modelPicker.replaceChildren(...options);
  els.modelPicker.value = MODEL ? MODEL.id : "";
  els.modelPicker.classList.toggle("unchosen", !MODEL);
  els.modelPicker.classList.toggle("loading", loading);
  els.modelPicker.classList.toggle("loading-model", loading);
  if (label) els.modelPicker.selectedOptions[0].textContent = label;
  els.modelPicker.disabled = busy || loading;
}
function showSelected() {
  els.attachButton.classList.toggle("hidden", MODEL?.kind !== "multi" && MODEL?.kind !== "api");
  renderModelPicker();
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const icon = (n) => `<span class="icon icon-${n}"></span>`;
const ask = (options) => popups.ask(options);

let preferences = settings.get("muai", DEFAULTS);
const savePreferences = (values) => { preferences = { ...preferences, ...values }; settings.set("muai", preferences); };
settings.onChange("muai", DEFAULTS, (changed) => {
  const modelChanged = changed.model !== preferences.model, widthChanged = changed.sideWidth !== preferences.sideWidth;
  preferences = changed;
  if (widthChanged) setSideWidth(changed.sideWidth);
  if (modelChanged) {
    const chosen = changed.model === "api" ? (apiReady() ? apiDef() : null) : MODELS.find((m) => m.id === changed.model);
    if (chosen) chooseModel(chosen); else if (!changed.model) { MODEL = null; showSelected(); renderChat(); }
  }
});

const db = await new Promise((res) => {
  try {
    const r = indexedDB.open("muai", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("convs", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => res(null);
  } catch { res(null); }
});
const tx = (mode) => db.transaction("convs", mode).objectStore("convs");
const put = (c) => db ? new Promise((res) => { const r = tx("readwrite").put(c); r.onsuccess = r.onerror = () => res(); }) : Promise.resolve();
const del = (id) => db ? new Promise((res) => { const r = tx("readwrite").delete(id); r.onsuccess = r.onerror = () => res(); }) : Promise.resolve();
const idb = {
  all: () => db ? new Promise((res) => { const r = tx("readonly").getAll(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); }) : Promise.resolve([]),
  save: put,
  drop: del,
  put: async (c) => { await put(c); changed(c.id); },
  del: async (id) => { await del(id); removedChat(id); },
  clear: async () => { for (const c of await idb.all()) removedChat(c.id); if (db) await new Promise((res) => { const r = tx("readwrite").clear(); r.onsuccess = r.onerror = () => res(); }); },
};
if (!db) popups.toast(tr("toast.storage"), { kind: "warning" });

const CHATS = "conversations", FILES = "files";
let store = null, syncTimer = 0, knownFiles = new Set();
const dirty = new Set(), removed = new Set();
function changed(id) { dirty.add(id); removed.delete(id); scheduleSync(); }
function removedChat(id) { removed.add(id); dirty.delete(id); scheduleSync(); }
function scheduleSync() {
  if (!window.account?.get()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flush, 2500);
}
const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

async function toRemote(c) {
  const messages = [];
  for (const { image, ...message } of c.messages) {
    if (typeof image === "string" && image.startsWith("data:")) {
      const [head, data] = image.split(",");
      const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
      const hash = await sha256(bytes);
      if (!knownFiles.has(hash)) { await storage.writeBinary(store, `${FILES}/${hash}`, bytes, "muAI: save a file"); knownFiles.add(hash); }
      message.file = { sha256: hash, type: head.slice(5).split(";")[0] };
    }
    messages.push(message);
  }
  const { sha, remoteSha, unloaded, stale, ...chat } = c;
  return { ...chat, messages };
}

async function flush() {
  if (!window.account?.get()) return;
  try {
    store ??= await storage.connect("muai");
    for (const id of [...dirty]) {
      dirty.delete(id);
      const c = convs.find((x) => x.id === id);
      if (!c || c.unloaded) continue;
      try {
        c.sha = await storage.writeFile(store, `${CHATS}/${id}.json`, JSON.stringify(await toRemote(c)), "muAI: save a chat");
        await idb.save(c);
      } catch (error) { dirty.add(id); throw error; }
    }
    for (const id of [...removed]) {
      removed.delete(id);
      try { await storage.removeFile(store, `${CHATS}/${id}.json`, "muAI: delete a chat"); } catch (error) { removed.add(id); throw error; }
    }
  } catch (error) { console.warn("[sync]", error); }
}

async function pullChats() {
  if (!window.account?.get()) return;
  try {
    store = await storage.connect("muai");
    const [chatFiles, files] = await Promise.all([storage.list(store, CHATS), storage.list(store, FILES)]);
    knownFiles = new Set(files.map((file) => file.name));
    const remoteIds = new Set();
    let listChanged = false;
    for (const file of chatFiles) {
      if (!file.name.endsWith(".json")) continue;
      const id = file.name.slice(0, -5);
      remoteIds.add(id);
      const local = convs.find((c) => c.id === id);
      if (!local) {
        const created = parseInt(id.slice(0, 8), 36) || Date.now();
        const chat = { id, title: new Date(created).toLocaleString(i18n.lang), created, updated: created, messages: [], unloaded: true, sha: null, remoteSha: file.sha };
        convs.push(chat); await idb.save(chat); listChanged = true;
      } else if (file.sha !== local.sha && !dirty.has(id)) {
        local.stale = true; local.remoteSha = file.sha; await idb.save(local);
      }
    }
    for (const c of [...convs]) {
      if (c.sha && !remoteIds.has(c.id) && !dirty.has(c.id)) {
        convs = convs.filter((x) => x !== c); await idb.drop(c.id);
        if (current === c) current = null;
        listChanged = true;
      } else if (!c.sha && !c.unloaded && !remoteIds.has(c.id)) dirty.add(c.id);
    }
    if (listChanged) { convs.sort((a, b) => b.updated - a.updated); await openWanted(); renderList(); renderChat(); }
    scheduleSync();
  } catch (error) { console.warn("[sync]", error); }
}

async function loadChat(c) {
  if (!(c.unloaded || c.stale) || !window.account?.get()) return;
  try {
    store ??= await storage.connect("muai");
    const text = await storage.readFile(store, `${CHATS}/${c.id}.json`);
    if (!text) return;
    const remote = JSON.parse(text);
    await Promise.all((remote.messages || []).map(async (message) => {
      if (!message.file) return;
      const bytes = await storage.readBinary(store, `${FILES}/${message.file.sha256}`);
      if (!bytes) return;
      message.image = await new Promise((res) => { const reader = new FileReader(); reader.onload = () => res(reader.result); reader.readAsDataURL(new Blob([bytes], { type: message.file.type })); });
      delete message.file;
    }));
    Object.assign(c, { title: remote.title, created: remote.created, updated: remote.updated, messages: remote.messages || [], sha: c.remoteSha, unloaded: false, stale: false });
    await idb.save(c);
    renderList();
  } catch (error) { console.warn("[sync]", error); }
}

let convs = (await idb.all()).sort((a, b) => b.updated - a.updated);
let current = null;
let wantedChat = urlState.get("chat");
async function openWanted() {
  const chat = wantedChat && convs.find((c) => c.id === wantedChat);
  if (!chat || current) return;
  wantedChat = "";
  await loadChat(chat);
  current = chat;
}
let processor = null, tokenizer = null, model = null;
let loadedDef = null;
let pendingImage = null;
let busy = false;
const stopper = new InterruptableStoppingCriteria();

let gpuOk = false;
try { if (navigator.gpu && (await navigator.gpu.requestAdapter())) gpuOk = true; } catch {}
if (!gpuOk && MODEL?.kind !== "api") popups.toast(tr("gpu.unsupported"), { kind: "error" });

function md(src) {
  const blocks = [], codes = [];
  src = src.replace(/```([\w+-]*)[ \t]*\n?([\s\S]*?)(```|$)/g, (m, l, c) => { blocks.push({ l, c: c.replace(/\n$/, "") }); return `\u0000B${blocks.length - 1}\u0000`; });
  src = src.replace(/`([^`\n]+)`/g, (m, c) => { codes.push(c); return `\u0000C${codes.length - 1}\u0000`; });
  const inl = (s) => esc(s)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\u0000C(\d+)\u0000/g, (m, i) => `<code>${esc(codes[i])}</code>`);
  const out = []; let para = [], list = null;
  const flushP = () => { if (para.length) { out.push(`<span class="p">${para.map(inl).join("<br>")}</span>`); para = []; } };
  const flushL = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of src.split("\n")) {
    let m;
    if ((m = line.match(/^\u0000B(\d+)\u0000$/))) {
      flushP(); flushL(); const b = blocks[m[1]];
      out.push(`<div class="code"><div class="code-header"><span>${esc(b.l || tr("code.label"))}</span><button class="ghost copy-code" type="button">${icon("copy")}<span>${tr("msg.copy")}</span></button></div><pre><code>${esc(b.c)}</code></pre></div>`);
    } else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushP(); flushL(); out.push(`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`);
    } else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushP(); flushL(); out.push("<hr>");
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushP(); flushL(); out.push(`<blockquote>${inl(m[1])}</blockquote>`);
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flushP(); if (list !== "ul") { flushL(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inl(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushP(); if (list !== "ol") { flushL(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inl(m[1])}</li>`);
    } else if (!line.trim()) { flushP(); flushL(); }
    else { flushL(); para.push(line); }
  }
  flushP(); flushL();
  return out.join("");
}

function groupName(ts) {
  const d = new Date(ts), n = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 864e5);
  return tr(diff <= 0 ? "group.today" : diff === 1 ? "group.yesterday" : diff < 7 ? "group.week" : "group.older");
}
function renderList() {
  const q = els.chatSearch.value.trim().toLowerCase();
  const shown = convs.filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text && m.text.toLowerCase().includes(q)));
  els.chatList.innerHTML = "";
  if (!shown.length) {
    const e = document.createElement("span"); e.className = "empty-chat-list";
    e.textContent = tr(q ? "list.noMatches" : "list.empty");
    els.chatList.appendChild(e); return;
  }
  let last = "";
  for (const c of shown) {
    const g = groupName(c.updated);
    if (g !== last) { const h = document.createElement("span"); h.className = "date-group"; h.textContent = g; els.chatList.appendChild(h); last = g; }
    const it = document.createElement("div");
    it.className = "chat-item" + (current && current.id === c.id ? " active" : "");
    it.dataset.id = c.id;
    it.innerHTML = `<span class="chat-list-title"></span><div class="actions"><button data-a="rename" type="button" title="${tr("chat.rename")}" aria-label="${tr("chat.rename")}">${icon("pencil")}</button><button data-a="delete" type="button" title="${tr("chat.delete")}" aria-label="${tr("chat.delete")}">${icon("trash")}</button></div>`;
    it.querySelector(".chat-list-title").textContent = c.title;
    it.title = new Date(c.updated).toLocaleString(i18n.lang);
    it.tabIndex = 0;
    it.addEventListener("keydown", (e) => { if (e.target === it && e.key === "Enter") it.click(); });
    els.chatList.appendChild(it);
  }
}
els.chatList.addEventListener("click", async (e) => {
  const it = e.target.closest(".chat-item"); if (!it) return;
  const c = convs.find((x) => x.id === it.dataset.id); if (!c) return;
  const a = e.target.closest("button")?.dataset.a;
  if (a === "rename") {
    const t = await ask({ text: tr("prompt.name"), value: c.title, ok: tr("chat.rename") });
    if (t && t.trim()) { c.title = t.trim().slice(0, 80); await idb.put(c); renderList(); if (current === c) els.chatTitle.textContent = c.title; }
  } else if (a === "delete") {
    if (busy && current === c) return popups.toast(tr("toast.wait"), { kind: "warning" });
    if (!(await ask({ text: tr("confirm.delete", { title: c.title }), ok: tr("chat.delete") }))) return;
    convs = convs.filter((x) => x !== c); await idb.del(c.id);
    if (current === c) newChat(); else renderList();
  } else openConv(c);
});
els.chatSearch.addEventListener("input", renderList);
autocomplete.attach(els.chatSearch, { suggestions: () => convs.map((chat) => chat.title) });

function setTitle() {
  els.chatTitle.textContent = current ? current.title : tr("title.new");
  els.exportButton.classList.toggle("hidden", !current);
}
function makeMsgEl(m, idx) {
  const parts = [];
  if (m.image) {
    const im = document.createElement("div"); im.className = "message-image";
    im.style.backgroundImage = `url("${m.image}")`; im.setAttribute("role", "img"); im.setAttribute("aria-label", tr("msg.attachment"));
    parts.push(im);
  }
  const body = document.createElement("div");
  if (m.role === "user") body.textContent = m.text;
  else { body.className = "markdown" + (m.error ? " error" : ""); body.innerHTML = m.error ? esc(m.text) : md(m.text); }
  if (m.plan?.length || m.actions?.length) body.insertAdjacentHTML("beforeend", planHtml(m.plan) + actionsHtml(m.actions));
  parts.push(body);
  const acts = document.createElement("div"); acts.className = "message-actions"; acts.slot = "footer";
  acts.innerHTML = `<button class="ghost" type="button" data-a="copy">${icon("copy")}<span>${tr("msg.copy")}</span></button>` +
    (m.role === "user"
      ? `<button class="ghost" type="button" data-a="edit">${icon("pencil")}<span>${tr("msg.edit")}</span></button>`
      : `<button class="ghost" type="button" data-a="regen">${icon("refresh")}<span>${tr("msg.regen")}</span></button>`) +
    (m.tps ? `<span class="model-meta">${m.model ? esc(m.model) + " · " : ""}${tr("msg.tps", { n: m.tps.toFixed(1) })}</span>` : "");
  const row = components.make("message", { end: m.role === "user", bubble: m.role === "user" ? "filled" : null }, [...parts, acts]);
  row.parts.bubble.classList.add("selectable"); row.dataset.idx = idx;
  return { row, body };
}
function renderChat() {
  els.chat.innerHTML = "";
  const empty = !current || !current.messages.length;
  els.welcomeMessage.classList.toggle("hidden", !empty);
  els.main.classList.toggle("welcoming", empty);
  els.chat.classList.toggle("hidden", empty);
  if (!empty) current.messages.forEach((m, i) => els.chat.appendChild(makeMsgEl(m, i).row));
  els.chatArea.scrollTop = els.chatArea.scrollHeight;
  setTitle(); renderList();
  if (current) urlState.set({ chat: current.id });
}
els.chat.addEventListener("click", async (e) => {
  const btn = e.target.closest("button"); if (!btn) return;
  if (btn.classList.contains("copy-code")) {
    await navigator.clipboard?.writeText(btn.closest(".code").querySelector("code").innerText).catch(() => {});
    const label = btn.querySelector("span:not(.icon)");
    label.textContent = tr("code.copied"); setTimeout(() => (label.textContent = tr("msg.copy")), 1200); return;
  }
  const a = btn.dataset.a; if (!a) return;
  const idx = +btn.closest(".message").dataset.idx, m = current.messages[idx];
  if (a === "copy") { await navigator.clipboard?.writeText(m.text).catch(() => {}); popups.toast(tr("toast.copied")); return; }
  if (busy) return popups.toast(tr("toast.wait"), { kind: "warning" });
  if (a === "edit") {
    current.messages.splice(idx); current.updated = Date.now(); await idb.put(current);
    els.messageInput.value = m.text; pendingImage = m.image && (loadedDef?.kind === "multi" || loadedDef?.kind === "api") ? m.image : null;
    showPreview(); autosize(); renderChat(); els.messageInput.focus();
  } else if (a === "regen") {
    if (!(await ensureModel())) return;
    current.messages.splice(idx); await runAssistant();
  }
});

function newChat() {
  if (busy) return;
  current = null; wantedChat = ""; urlState.set({ chat: "" }); renderChat(); closeSide(); els.messageInput.focus();
}
async function openConv(c) {
  if (busy) return popups.toast(tr("toast.wait"), { kind: "warning" });
  await loadChat(c);
  current = c; renderChat(); closeSide();
}
els.newChatButton.addEventListener("click", newChat);

async function unloadModel() {
  try { await model?.dispose?.(); } catch (e) { console.warn("dispose failed", e); }
  model = null; processor = null; tokenizer = null; loadedDef = null;
  els.modelPicker.classList.remove("ok");
}

async function ensureModel() {
  if (MODEL?.kind === "api") {
    if (!apiReady()) { popups.toast(tr("error.apiNone"), { kind: "warning" }); openConnections(); return false; }
    loadedDef = MODEL;
    return true;
  }
  if (model) return true;
  if (!MODEL) { popups.toast(tr("model.none"), { kind: "warning" }); els.modelPicker.focus(); return false; }
  if (!gpuOk) { popups.toast(tr("gpu.unsupported"), { kind: "error" }); return false; }
  if (loading) { popups.toast(tr("toast.wait"), { kind: "warning" }); return false; }
  await loadModel();
  return !!model;
}

let loading = false;
async function loadModel() {
  if (busy || loading) return;
  loading = true;
  const def = MODEL;
  const note = popups.toast(tr("progress.preparing"), { duration: 0, progress: 0 });
  renderModelPicker(tr("load.loading", { name: def.name }));
  const files = new Map();
  const onProgress = (info) => {
    if (info.status === "progress" && info.file) {
      files.set(info.file, { loaded: info.loaded, total: info.total });
      let l = 0, t = 0; for (const f of files.values()) { l += f.loaded; t += f.total; }
      const pct = t ? (l / t) * 100 : 0;
      note.set(tr("load.progress", { loaded: (l / 1e6).toFixed(0), total: (t / 1e6).toFixed(0), pct: pct.toFixed(0) }), pct / 100);
    } else if (info.status === "ready") note.set(tr("load.gpu"));
  };
  try {
    const opts = { dtype: def.dtype ?? i18n.data.defaultDtype, device: "webgpu", progress_callback: onProgress };
    if (def.kind === "multi") {
      processor = await AutoProcessor.from_pretrained(def.id);
      if (!processor.tokenizer) processor = await Gemma4Processor.from_pretrained(def.id);
      tokenizer = processor.tokenizer;
      model = await Gemma4ForConditionalGeneration.from_pretrained(def.id, opts);
    } else {
      tokenizer = await AutoTokenizer.from_pretrained(def.id);
      model = await AutoModelForCausalLM.from_pretrained(def.id, opts);
    }
    loadedDef = def;
    note.set(tr("load.warm"));
    await generate([{ role: "user", content: def.kind === "multi" ? [{ type: "text", text: "Hi" }] : "Hi" }], [], { maxTokens: 1, temperature: 0 });
    savePreferences({ model: def.id });
    els.modelPicker.classList.add("ok");
    renderChat(); els.messageInput.focus();
  } catch (e) {
    console.error(e);
    try { await model?.dispose?.(); } catch {}
    model = null; processor = null; tokenizer = null; loadedDef = null;
    popups.toast(tr("load.failed", { name: def.name, message: e?.message || e }), { kind: "error" });
  } finally {
    note.close();
    loading = false; renderModelPicker();
  }
}

async function chooseModel(m) {
  if (busy) { renderModelPicker(); return popups.toast(tr("toast.wait"), { kind: "warning" }); }
  if (m.kind === "api") {
    if (model) await unloadModel();
    MODEL = m; loadedDef = m; savePreferences({ model: "api" }); showSelected(); renderChat();
    els.modelPicker.classList.add("ok");
    return;
  }
  if (loadedDef?.kind === "api") { loadedDef = null; els.modelPicker.classList.remove("ok"); }
  const seen = lsGet("muai.seen." + m.id) === "1";
  if (!seen && m.mb >= 1000 && !(await ask({ text: tr("picker.confirm", { name: m.name, size: sizeLabel(m.mb) }), ok: tr("picker.select") }))) { renderModelPicker(); return; }
  if (model) await unloadModel();
  MODEL = m; savePreferences({ model: m.id }); showSelected(); renderChat();
  await loadModel();
  if (loadedDef && loadedDef.id === m.id) lsSet("muai.seen." + m.id, "1");
}
els.modelPicker.addEventListener("change", () => {
  if (els.modelPicker.value === "api") {
    if (apiReady()) chooseModel(apiDef()); else { renderModelPicker(); openConnections(); }
    return;
  }
  const chosen = MODELS.find((m) => m.id === els.modelPicker.value);
  if (chosen) chooseModel(chosen); else renderModelPicker();
});

let abort = null;
const MAX_STEPS = 40;
const TOOL_RESULT_CHARS = 20000;
const CONTEXT_CHARS = 240000;
const REPEATS = 3;
const fileProperty = { path: { type: "string", description: "A path relative to the folder of the user, with / between the names." } };
const tool = (name, description, properties, required = []) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } });
const TOOLS = [
  tool("update_plan", "Write down or update the plan of the task: the list of steps, each with a status. Call it first for a task of several steps, and again when a step starts or is done. The user sees it.", { steps: { type: "array", items: { type: "object", properties: { text: { type: "string" }, status: { type: "string", enum: ["todo", "doing", "done"] } }, required: ["text", "status"] } } }, ["steps"]),
  tool("list_files", "List the files and folders of a folder of the user. recursive true gives everything under it (the whole tree).", { ...fileProperty, recursive: { type: "boolean" } }),
  tool("search_files", "Find the lines that have a text (capitals do not matter) in the files under a folder. It gives the path, the line number, and the line.", { query: { type: "string" }, ...fileProperty, max: { type: "number" } }, ["query"]),
  tool("read_file", "Read a text file. offset (the first line, from 1) and limit (how many lines) read only a part of a long file.", { ...fileProperty, offset: { type: "number" }, limit: { type: "number" } }, ["path"]),
  tool("write_file", "Write a text file; the folders are made when needed. overwrite true replaces a file that exists, append true adds to the end of it. The user may refuse.", { ...fileProperty, content: { type: "string" }, overwrite: { type: "boolean" }, append: { type: "boolean" } }, ["path", "content"]),
  tool("edit_file", "Change a file: the text in old is replaced by the text in new. old must be in the file exactly once (give enough text around it), or replace_all must be true. Use it for a small change instead of writing the whole file again.", { ...fileProperty, old: { type: "string" }, new: { type: "string" }, replace_all: { type: "boolean" } }, ["path", "old", "new"]),
];
const AGENT_NOTE = `You are an agent: with the tools you can do a long task by yourself, in one folder of the user's PC. For a task of several steps, first call update_plan with the steps, then do them one after the other, and call update_plan again when a step starts or is done. Look before you change: list_files (recursive true gives the whole tree), search_files, read_file (offset and limit read a part of a long file). Change files with edit_file (a small exact change) or write_file (a new file, or the whole file with overwrite true; append true adds to the end). After a change, check it (read it back or search). Do not ask the user for permission before each step: ask only when you cannot go on without an answer. When the task is done, stop calling tools and say in a few lines what you did and what is left. Use the tools only when the user asks for something with files.`;
const trimUrl = (url) => url.trim().replace(/\/+$/, "");

async function helper(operation, body, conn = connection, again = true) {
  let response;
  try {
    response = await fetch(`${trimUrl(conn.helperUrl)}/${operation}`, { method: operation === "ping" ? "GET" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${conn.helperToken.trim()}` }, ...(operation === "ping" ? {} : { body: JSON.stringify(body) }) });
  } catch (error) { throw new Error(tr("conn.test.failed", { url: trimUrl(conn.helperUrl), origin: location.origin, message: error.message })); }
  if (response.status === 401 && again && conn === connection && await connectHelper({ quiet: true })) return helper(operation, body, connection, false);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

const HELPER_URL = "http://127.0.0.1:47615";
const INSTALL_WINDOWS = "irm https://kancamu.site/assets/tools/muai-helper/install.ps1 | iex";
const INSTALL_UNIX = "curl -fsSL https://kancamu.site/assets/tools/muai-helper/install.sh | sh";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const saveConnection = () => { try { localStorage.setItem(CONNECTION_KEY, JSON.stringify(connection)); } catch { } };
let helperInfo = null;
let helperPairing = null;
let helperDenied = false;
let onHelperChange = null;
const lastName = (path) => path.split(/[\\/]/).filter(Boolean).pop() || path;
function showHelper(info) {
  helperInfo = info;
  els.helperButton.classList.toggle("connected", !!info);
  els.helperButton.title = info ? tr(info.folder ? "helper.connected" : "helper.connectedNoFolder", { folder: info.folder }) : tr("helper.title");
  els.folderButton.classList.toggle("hidden", !info);
  els.folderButton.classList.toggle("unset", !!info && !info.folder);
  els.folderLabel.textContent = info?.folder ? lastName(info.folder) : tr("folder.choose");
  els.folderButton.title = info?.folder ? tr("folder.current", { folder: info.folder }) : tr("folder.choose");
  onHelperChange?.();
}
async function pingHelper(url, token) {
  try {
    const response = await fetch(`${url}/ping`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(1500) });
    const info = await response.json();
    return response.ok && info.name === "muai-helper" ? info : null;
  } catch { return null; }
}
function connectHelper({ force = false, quiet = false } = {}) {
  if (helperPairing) return helperPairing;
  if (helperDenied && !force) return Promise.resolve(false);
  if (force) helperDenied = false;
  helperPairing = (async () => {
    try {
      let url = "", info = null;
      for (const candidate of [...new Set([trimUrl(connection.helperUrl || ""), HELPER_URL].filter(Boolean))]) {
        info = await pingHelper(candidate, connection.helperToken.trim());
        if (info) { url = candidate; break; }
      }
      if (!info) { showHelper(null); return false; }
      if (info.authorized) { showHelper(info); return true; }
      for (let attempt = 0; attempt < 60; attempt++) {
        let data = {};
        try { data = await (await fetch(`${url}/pair`, { method: "POST" })).json(); } catch { showHelper(null); return false; }
        if (data.token) {
          connection = { ...connection, helperUrl: url, helperToken: data.token };
          saveConnection();
          showHelper({ ...info, folder: data.folder || info.folder });
          if (!quiet) popups.toast(tr("helper.connected", { folder: data.folder || info.folder }));
          return true;
        }
        if (data.status === "denied") { helperDenied = true; showHelper(null); popups.toast(tr("helper.denied"), { kind: "warning" }); return false; }
        if (attempt === 0) popups.toast(tr("helper.approve"), { kind: "info", duration: 10000 });
        await sleep(1500);
      }
      return false;
    } finally { helperPairing = null; }
  })();
  return helperPairing;
}
let watchTimer = 0, watchDelay = 2000;
async function watchHelper() {
  if (!document.hidden) {
    const connected = await connectHelper();
    watchDelay = connected ? 10000 : Math.min(Math.round(watchDelay * 1.6), 30000);
  }
  watchTimer = setTimeout(watchHelper, watchDelay);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { watchDelay = 2000; clearTimeout(watchTimer); watchHelper(); } });

const STATUSES = ["todo", "doing", "done"];
function cleanPlan(steps) {
  if (!Array.isArray(steps)) throw new Error("steps must be a list");
  return steps.slice(0, 30).map((step) => ({ text: String(step?.text ?? "").trim().slice(0, 200), status: STATUSES.includes(step?.status) ? step.status : "todo" })).filter((step) => step.text);
}
const lastPlan = () => structuredClone([...(current?.messages || [])].reverse().find((m) => m.role === "assistant" && m.plan?.length)?.plan || []);

async function approve(run, kind, path, bytes) {
  const mode = connection.writeMode;
  if (mode === "never" || (mode === "task" && run.approved)) return true;
  const text = mode === "task" ? "tool.confirmTask" : { replace: "tool.confirmReplace", edit: "tool.confirmEdit", append: "tool.confirmAppend" }[kind] || "tool.confirmWrite";
  const ok = mode === "task" ? "tool.allow" : { replace: "tool.replace", edit: "tool.edit" }[kind] || "tool.write";
  const yes = await ask({ text: tr(text, { path, bytes }), ok: tr(ok), kind: kind === "replace" ? "warning" : undefined });
  if (yes && mode === "task") run.approved = true;
  return yes;
}

async function runTool(call, run) {
  let args = {};
  try { args = JSON.parse(call.arguments || "{}") || {}; } catch { }
  const path = String(args.path ?? "");
  const key = `${call.name}:${call.arguments || ""}`;
  const times = (run.seen.get(key) || 0) + 1;
  run.seen.set(key, times);
  if (call.name === "update_plan") {
    try { run.plan = cleanPlan(args.steps); run.hooks.plan(run.plan); return { ok: true, steps: run.plan.length }; } catch (error) { return { error: error.message }; }
  }
  const record = { tool: call.name, path: call.name === "search_files" ? String(args.query ?? "") : path || "/", ok: false, note: "" };
  run.actions.push(record);
  if (times > REPEATS) {
    run.repeats++;
    record.note = tr("agent.repeat");
    return { error: "You made this exact call already. Do something different, or finish and tell the user what is not done." };
  }
  try {
    if (!helperReady()) throw new Error(tr("tool.noHelper"));
    let result;
    if (call.name === "write_file") {
      const content = String(args.content ?? "");
      const bytes = new TextEncoder().encode(content).length;
      const kind = args.append === true ? "append" : args.overwrite === true ? "replace" : "write";
      if (!(await approve(run, kind, path, bytes))) throw new Error(tr("tool.refused"));
      result = await helper("write", { path, content, overwrite: args.overwrite === true, append: args.append === true });
    } else if (call.name === "edit_file") {
      if (!(await approve(run, "edit", path, 0))) throw new Error(tr("tool.refused"));
      result = await helper("edit", { path, old: String(args.old ?? ""), new: String(args.new ?? ""), replace_all: args.replace_all === true });
    } else if (call.name === "read_file") result = await helper("read", { path, ...(args.offset ? { offset: Number(args.offset) } : {}), ...(args.limit ? { limit: Number(args.limit) } : {}) });
    else if (call.name === "list_files") result = await helper("list", { path, recursive: args.recursive === true });
    else if (call.name === "search_files") result = await helper("search", { query: String(args.query ?? ""), path, ...(args.max ? { max: Number(args.max) } : {}) });
    else throw new Error("unknown tool");
    record.ok = true;
    return result;
  } catch (error) {
    record.note = error.message;
    return { error: error.message };
  }
}
const markers = { todo: "☐", doing: "▶", done: "✓" };
const planHtml = (plan) => plan?.length
  ? `<div class="plan"><div class="plan-title">${esc(tr("plan.title"))}</div><ul>${plan.map((step) => `<li class="${step.status}"><span class="plan-mark">${markers[step.status]}</span>${esc(step.text)}</li>`).join("")}</ul></div>`
  : "";
const actionsHtml = (actions) => actions?.length
  ? `<ul class="tool-log">${actions.map((a) => `<li class="${a.ok ? "ok" : "failed"}">${esc(a.ok ? tr(`tool.${a.tool}`, { path: a.path }) : tr("tool.failed", { tool: a.tool, message: a.note }))}</li>`).join("")}</ul>`
  : "";
const statusHtml = (status) => (status ? `<div class="agent-status">${esc(status)}</div>` : "");

function buildApiMessages() {
  const msgs = [];
  const system = [preferences.system.trim(), agentReady() ? AGENT_NOTE : ""].filter(Boolean).join("\n\n");
  if (system) msgs.push({ role: "system", content: system });
  let hist = current.messages.filter((m) => !m.error).slice(-preferences.ctx);
  while (hist.length && hist[0].role !== "user") hist.shift();
  for (const m of hist) {
    if (m.role === "user") msgs.push({ role: "user", content: m.image ? [{ type: "text", text: m.text }, { type: "image_url", image_url: { url: m.image } }] : m.text });
    else msgs.push({ role: "assistant", content: m.text
      + (m.actions?.length ? "\n\n" + m.actions.map((a) => `[${a.tool} ${a.path}: ${a.ok ? "ok" : "failed"}]`).join("\n") : "")
      + (m.plan?.length ? "\n\nPlan:\n" + m.plan.map((step) => `- [${step.status === "done" ? "x" : step.status === "doing" ? "~" : " "}] ${step.text}`).join("\n") : "") });
  }
  return { msgs, imgs: [] };
}

async function streamChat(body, onText, signal) {
  const headers = { "Content-Type": "application/json" };
  if (connection.apiKey.trim()) headers.Authorization = `Bearer ${connection.apiKey.trim()}`;
  let response;
  try {
    response = await fetch(`${trimUrl(connection.baseUrl)}/chat/completions`, { method: "POST", headers, body: JSON.stringify({ ...body, stream: true }), signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(tr("error.apiUnreachable", { url: trimUrl(connection.baseUrl) }));
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { const data = await response.json(); message = data.error?.message || data.message || JSON.stringify(data).slice(0, 300); } catch { }
    throw Object.assign(new Error(message), { status: response.status });
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", content = "", chunks = 0, first = 0;
  const calls = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let json;
      try { json = JSON.parse(data); } catch { continue; }
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) { first ||= performance.now(); chunks++; content += delta.content; onText(delta.content); }
      for (const piece of delta.tool_calls || []) {
        const call = (calls[piece.index ?? 0] ??= { id: "", name: "", arguments: "" });
        if (piece.id) call.id = piece.id;
        if (piece.function?.name) call.name += piece.function.name;
        if (piece.function?.arguments) call.arguments += piece.function.arguments;
      }
    }
  }
  return { content, calls: calls.filter(Boolean), chunks, first };
}

function compact(msgs) {
  const size = () => msgs.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content ?? "").length) + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0), 0);
  for (let i = 0; i < msgs.length - 6 && size() > CONTEXT_CHARS; i++) {
    const m = msgs[i];
    if (m.role === "tool" && m.content.length > 200) m.content = JSON.stringify({ omitted: `an old result of ${m.content.length} characters` });
    for (const call of m.tool_calls || []) if (call.function.arguments.length > 400) call.function.arguments = JSON.stringify({ omitted: "the arguments of an old call (they were used)" });
  }
}
const clip = (text) => (text.length > TOOL_RESULT_CHARS ? `${text.slice(0, TOOL_RESULT_CHARS)}… [${text.length - TOOL_RESULT_CHARS} more characters were cut: ask for a part, with offset and limit or a narrower search]` : text);

async function generateApi(msgs, hooks) {
  abort = new AbortController();
  const maxSteps = Math.max(1, Math.min(200, Math.round(Number(preferences.agentSteps)) || MAX_STEPS));
  const run = { actions: [], plan: lastPlan(), approved: false, seen: new Map(), repeats: 0, hooks };
  let text = "", chunks = 0, first = 0, last = 0;
  const body = { model: connection.model.trim(), messages: msgs, temperature: preferences.temperature, max_tokens: preferences.maxTokens, ...(agentReady() ? { tools: TOOLS } : {}) };
  const add = (piece) => { text += piece; hooks.text(piece); };
  try {
    for (let step = 1; ; step++) {
      if (step > maxSteps) { add(`\n\n${tr("agent.limit", { n: maxSteps })}`); break; }
      if (step > 1 && text && !text.endsWith("\n")) add("\n\n");
      hooks.status(agentReady() ? tr("agent.step", { n: step, max: maxSteps, what: tr("agent.thinking") }) : "");
      compact(msgs);
      let result;
      for (let attempt = 0; ; attempt++) {
        try { result = await streamChat(body, add, abort.signal); break; } catch (error) {
          if (error.name === "AbortError" || error.status !== 400 || attempt >= 2) throw error;
          if (/max_completion_tokens/i.test(error.message) && "max_tokens" in body) { body.max_completion_tokens = body.max_tokens; delete body.max_tokens; }
          else if (/temperature/i.test(error.message) && "temperature" in body) delete body.temperature;
          else throw error;
        }
      }
      chunks += result.chunks; first ||= result.first; if (result.chunks) last = performance.now();
      if (!result.calls.length) break;
      msgs.push({ role: "assistant", content: result.content || null, tool_calls: result.calls.map((call, index) => ({ id: call.id ||= `call_${step}_${index}`, type: "function", function: { name: call.name, arguments: call.arguments || "{}" } })) });
      for (const call of result.calls) {
        if (abort.signal.aborted) throw Object.assign(new Error("stopped"), { name: "AbortError" });
        hooks.status(tr("agent.step", { n: step, max: maxSteps, what: `${call.name} ${(() => { try { return JSON.parse(call.arguments).path || JSON.parse(call.arguments).query || ""; } catch { return ""; } })()}`.trim() }));
        const outcome = await runTool(call, run);
        hooks.actions(run.actions);
        msgs.push({ role: "tool", tool_call_id: call.id, content: clip(JSON.stringify(outcome)) });
      }
      if (run.repeats >= 2) { add(`\n\n${tr("agent.repeatStop")}`); break; }
    }
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  } finally {
    abort = null;
    hooks.status("");
  }
  return { text, tps: chunks > 1 && last > first ? (chunks - 1) / ((last - first) / 1000) : 0, actions: run.actions, plan: run.plan };
}

const { element, make } = components;
const field = (label, control, hint) => make("field", { label, hint }, [control]);
const input = (type, value, placeholder) => Object.assign(document.createElement("input"), { type, value, placeholder: placeholder || "", spellcheck: false, autocapitalize: "off" });
const button = (label, onClick, className = "") => {
  const node = Object.assign(element("button", className), { type: "button" });
  node.append(element("span", "", label));
  node.addEventListener("click", onClick);
  return node;
};
const iconButton = (name, label, onClick) => {
  const node = Object.assign(element("button", "square"), { type: "button", title: label });
  node.setAttribute("aria-label", label);
  node.append(components.icon(name));
  node.addEventListener("click", onClick);
  return node;
};
const row = (...buttons) => { const node = element("div", "connection-row"); node.append(...buttons); return node; };
const pressed = (node, onPress) => {
  node.setAttribute("role", "button");
  node.tabIndex = 0;
  node.addEventListener("click", onPress);
  node.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPress(); } });
  return node;
};
const closeSheetOf = (node) => node.closest("dialog")?.close();

function openConnections() {
  const form = document.createElement("form");
  form.className = "connection-form";
  form.autocomplete = "off";
  const baseUrl = input("url", connection.baseUrl, "https://api.openai.com/v1");
  const apiKey = input("password", connection.apiKey, tr("conn.apiKey.optional"));
  const modelName = input("text", connection.model, "gpt-4o-mini");
  modelName.setAttribute("list", "connection-models");
  const models = element("datalist");
  models.id = "connection-models";
  const draft = () => ({ baseUrl: baseUrl.value, apiKey: apiKey.value, model: modelName.value });
  const listModels = button(tr("conn.models"), async () => {
    try {
      const conn = draft();
      const response = await fetch(`${trimUrl(conn.baseUrl)}/models`, { headers: conn.apiKey.trim() ? { Authorization: `Bearer ${conn.apiKey.trim()}` } : {} });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
      const ids = (data.data || data.models || []).map((item) => item.id || item.name).filter(Boolean).sort();
      models.replaceChildren(...ids.map((id) => Object.assign(document.createElement("option"), { value: id })));
      popups.toast(tr("conn.models.found", { n: ids.length }));
    } catch (error) { popups.toast(tr("conn.models.failed", { message: error.message }), { kind: "error" }); }
  }, "wide");
  const remove = button(tr("conn.remove"), () => {
    try { localStorage.removeItem(CONNECTION_KEY); } catch { }
    connection = { ...NO_CONNECTION };
    showHelper(null);
    if (MODEL?.kind === "api") { MODEL = null; loadedDef = null; savePreferences({ model: "" }); }
    showSelected(); renderChat();
    popups.toast(tr("conn.removed"));
    closeSheetOf(form);
  }, "wide");
  const hint = make("alert", { kind: "info" }, [document.createTextNode(tr("conn.api.hint"))]);
  form.append(hint, field(tr("conn.baseUrl"), baseUrl), field(tr("conn.apiKey"), apiKey), field(tr("conn.model"), modelName), models, row(listModels), row(remove, button(tr("conn.save"), () => form.requestSubmit(), "primary wide")));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const next = draft();
    if ((next.baseUrl.trim() || next.model.trim()) && !(next.baseUrl.trim() && next.model.trim())) return popups.toast(tr("conn.needs"), { kind: "warning" });
    connection = { ...connection, ...next };
    saveConnection();
    popups.toast(tr("conn.saved"));
    closeSheetOf(form);
    if (apiReady()) { if (!busy) await chooseModel(apiDef()); } else if (MODEL?.kind === "api") { MODEL = null; loadedDef = null; savePreferences({ model: "" }); showSelected(); renderChat(); }
    renderModelPicker();
  });
  popups.sheet({ title: tr("conn.title"), node: form, side: "end" });
}
els.connectionButton.addEventListener("click", openConnections);

function openHelper() {
  const box = element("div", "connection-form");
  const state = element("div", "connection-form");
  const command = (label, text) => {
    const code = element("div", "code-block");
    code.dir = "ltr";
    code.append(element("pre", "", text));
    const copyButton = button(tr("conn.copyCommand"), async () => {
      try { await navigator.clipboard.writeText(text); popups.toast(tr("toast.copied")); } catch { }
    });
    const line = element("div", "connection-command");
    line.append(code, copyButton);
    return make("field", { label }, [line]);
  };
  let drawn = "";
  const draw = () => {
    const info = helperInfo;
    const signature = JSON.stringify([!!info, info?.folder, info?.locked, info?.browse, info?.version, helperDenied]);
    if (signature === drawn) return;
    drawn = signature;
    state.replaceChildren();
    if (!info) {
      state.append(
        make("alert", { kind: helperDenied ? "warning" : "info", heading: tr(helperDenied ? "helper.denied" : "helper.waiting") }, [document.createTextNode(tr("conn.helper.hint"))]),
        command(tr("conn.helper.cmdWindows"), INSTALL_WINDOWS), command(tr("conn.helper.cmdUnix"), INSTALL_UNIX),
      );
      if (helperDenied) state.append(row(button(tr("conn.connect"), () => connectHelper({ force: true }), "primary")));
      return;
    }
    state.append(make("alert", { kind: "success", heading: tr("helper.connectedShort", { version: info.version }) }));
    const shown = element("div", "code-block");
    shown.dir = "ltr";
    shown.append(element("pre", "", info.folder || tr("folder.none")));
    state.append(make("field", { label: tr("explorer.title") }, [shown]));
    if (info.locked) state.append(make("alert", { kind: "info" }, [document.createTextNode(tr("folder.locked"))]));
    else if (!info.browse) state.append(make("alert", { kind: "warning" }, [document.createTextNode(tr("helper.old"))]));
    else state.append(row(button(tr("folder.choose"), () => { closeSheetOf(box); openExplorer(); }, info.folder ? "wide" : "primary wide")));
  };
  const writeMode = document.createElement("select");
  writeMode.replaceChildren(...WRITE_MODES.map((mode) => Object.assign(document.createElement("option"), { value: mode, textContent: tr(`conn.mode.${mode}`) })));
  writeMode.value = connection.writeMode;
  writeMode.addEventListener("change", () => { connection = { ...connection, writeMode: writeMode.value }; saveConnection(); });
  const helperUrl = input("url", connection.helperUrl, HELPER_URL);
  const helperToken = input("password", connection.helperToken, "");
  const advanced = make("collapsible", { heading: tr("conn.advanced") }, [
    field(tr("conn.helperUrl"), helperUrl), field(tr("conn.helperToken"), helperToken),
    row(
      button(tr("conn.test"), async () => {
        try { const info = await helper("ping", null, { ...connection, helperUrl: helperUrl.value, helperToken: helperToken.value }); popups.toast(tr("conn.test.ok", { folder: info.folder || tr("folder.none") })); } catch (error) { popups.toast(error.message, { kind: "error" }); }
      }),
      button(tr("conn.save"), () => {
        connection = { ...connection, helperUrl: helperUrl.value.trim(), helperToken: helperToken.value.trim() };
        saveConnection();
        connectHelper({ force: true });
        popups.toast(tr("conn.saved"));
      }, "primary"),
    ),
  ]);
  box.append(state, field(tr("conn.writeMode"), writeMode), advanced);
  onHelperChange = draw;
  draw();
  const timer = setInterval(() => connectHelper({ quiet: true }), 1000);
  connectHelper({ quiet: true });
  popups.sheet({ title: tr("helper.title"), node: box, side: "end" }).then(() => {
    clearInterval(timer);
    if (onHelperChange === draw) onHelperChange = null;
  });
}
els.helperButton.addEventListener("click", openHelper);

function pathParts(path) {
  if (!path) return [];
  const windows = /^[A-Za-z]:[\\/]/.test(path);
  const names = path.split(/[\\/]/).filter(Boolean);
  const parts = windows ? [] : [{ name: "/", path: "/" }];
  let up = "";
  names.forEach((name, index) => {
    up = windows ? (index === 0 ? `${name}\\` : `${up.replace(/\\$/, "")}\\${name}`) : `${up}/${name}`;
    parts.push({ name, path: up });
  });
  return parts;
}

function openExplorer() {
  if (!helperInfo) { popups.toast(tr("helper.waiting"), { kind: "warning" }); openHelper(); return; }
  if (helperInfo.locked) return void popups.toast(tr("folder.locked"), { kind: "warning" });
  if (!helperInfo.browse) return void popups.toast(tr("helper.old"), { kind: "warning" });
  const wrap = element("div", "explorer");
  const bar = element("div", "explorer-bar");
  const list = element("div", "explorer-list scroll-area");
  let current = "", parent = null;
  const up = iconButton("arrow-up", tr("explorer.up"), () => show(parent || ""));
  const use = button(tr("explorer.use"), async () => {
    try {
      const done = await helper("folder", { path: current });
      await connectHelper({ quiet: true });
      popups.toast(tr("explorer.chosen", { folder: done.folder }));
      closeSheetOf(wrap);
    } catch (error) { popups.toast(tr("explorer.failed", { message: error.message }), { kind: "error" }); }
  }, "primary wide");
  const folderItem = (entry) => {
    const media = components.icon("folder");
    media.setAttribute("slot", "media");
    const node = make("item", { heading: entry.name, description: entry.description }, [media]);
    node.title = entry.path;
    return pressed(node, () => show(entry.path));
  };
  async function show(path) {
    try {
      const data = await helper("browse", { path });
      current = data.path;
      parent = data.parent;
      up.disabled = !current;
      use.disabled = !current;
      const here = [{ name: tr("explorer.places"), path: "" }, ...pathParts(current)];
      const crumbs = here.map((part, index) => {
        const crumb = element("span", "", part.name);
        return index < here.length - 1 ? pressed(crumb, () => show(part.path)) : crumb;
      });
      bar.replaceChildren(up, make("breadcrumbs", {}, crumbs));
      const trail = bar.querySelector("kit-breadcrumbs");
      trail.scrollLeft = trail.scrollWidth;
      const entries = current ? data.entries : data.places.map((place) => ({ ...place, description: place.path }));
      list.replaceChildren(...(entries.length ? entries.map(folderItem) : [make("empty", { icon: "folder", heading: tr("explorer.empty") })]));
      if (data.truncated) list.append(element("span", "note", tr("explorer.truncated")));
      list.scrollTop = 0;
    } catch (error) { popups.toast(tr("explorer.failed", { message: error.message }), { kind: "error" }); }
  }
  wrap.append(bar, list, row(use));
  popups.sheet({ title: tr("explorer.title"), node: wrap, side: "bottom" });
  show(helperInfo.folder || "");
}
els.folderButton.addEventListener("click", openExplorer);
watchHelper();

async function generate(messages, imgs, opts, onText) {
  let inputs;
  if (loadedDef.kind === "multi") {
    const prompt = processor.apply_chat_template(messages, { enable_thinking: false, add_generation_prompt: true });
    const loaded = await Promise.all(imgs.map((u) => load_image(u)));
    inputs = loaded.length
      ? await processor(prompt, loaded.length === 1 ? loaded[0] : loaded, null, { add_special_tokens: false })
      : await processor(prompt, null, null, { add_special_tokens: false });
  } else {
    inputs = tokenizer.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true, enable_thinking: false });
  }
  stopper.reset();
  let n = 0, t0 = 0;
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true, skip_special_tokens: true,
    callback_function: (txt) => onText && onText(txt),
    token_callback_function: () => { if (!t0) t0 = performance.now(); n++; },
  });
  const sample = opts.temperature > 0;
  const out = await model.generate({
    ...inputs, max_new_tokens: opts.maxTokens, do_sample: sample,
    ...(sample ? { temperature: opts.temperature } : {}), streamer, stopping_criteria: stopper,
  });
  const [text] = tokenizer.batch_decode(out.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true });
  const tps = t0 && n > 1 ? (n - 1) / ((performance.now() - t0) / 1000) : 0;
  return { text, tps };
}

function buildMessages() {
  if (loadedDef.kind === "api") return buildApiMessages();
  const msgs = [], imgs = [];
  if (preferences.system.trim()) msgs.push({ role: "system", content: preferences.system.trim() });
  let hist = current.messages.filter((m) => !m.error);
  hist = hist.slice(-preferences.ctx);
  while (hist.length && hist[0].role !== "user") hist.shift();
  const multi = loadedDef.kind === "multi";
  for (const m of hist) {
    if (m.role === "user") {
      if (!multi) { msgs.push({ role: "user", content: m.text }); continue; }
      const content = [];
      if (m.image) { content.push({ type: "image" }); imgs.push(m.image); }
      content.push({ type: "text", text: m.text }); msgs.push({ role: "user", content });
    } else msgs.push({ role: "assistant", content: multi ? [{ type: "text", text: m.text }] : m.text });
  }
  return { msgs, imgs };
}

function setBusy(v) {
  busy = v;
  els.sendButton.classList.toggle("hidden", v); els.stopButton.classList.toggle("hidden", !v);
  els.messageInput.disabled = v; els.attachButton.disabled = v;
  renderModelPicker();
}

async function runAssistant() {
  renderChat();
  const m = { role: "assistant", text: "" };
  const idx = current.messages.length;
  const { row, body } = makeMsgEl(m, idx);
  row.querySelector(".message-actions").classList.add("hidden");
  body.classList.add("cursor"); els.chat.appendChild(row);
  els.chatArea.scrollTop = els.chatArea.scrollHeight;
  setBusy(true);
  let acc = "", raf = 0;
  const paint = () => { raf = 0; body.innerHTML = md(acc) + planHtml(m.plan) + actionsHtml(m.actions) + statusHtml(m.status); body.classList.add("cursor"); els.chatArea.scrollTop = els.chatArea.scrollHeight; };
  try {
    const { msgs, imgs } = buildMessages();
    const show = (t) => { acc += t; if (!raf) raf = requestAnimationFrame(paint); };
    const r = loadedDef.kind === "api"
      ? await generateApi(msgs, {
        text: show,
        actions: (actions) => { m.actions = [...actions]; if (!raf) raf = requestAnimationFrame(paint); },
        plan: (plan) => { m.plan = structuredClone(plan); if (!raf) raf = requestAnimationFrame(paint); },
        status: (status) => { m.status = status; if (!raf) raf = requestAnimationFrame(paint); },
      })
      : await generate(msgs, imgs, { maxTokens: preferences.maxTokens, temperature: preferences.temperature }, show);
    m.text = r.text.trim() || (r.actions?.length ? "" : tr("msg.empty")); m.tps = r.tps; m.model = loadedDef.name;
    if (r.actions?.length) m.actions = r.actions;
    if (r.plan?.length) m.plan = r.plan;
  } catch (e) {
    console.error(e); m.text = tr("msg.error", { message: e?.message || e }); m.error = true;
  } finally {
    cancelAnimationFrame(raf);
    delete m.status;
    current.messages.push(m); current.updated = Date.now();
    convs.sort((a, b) => b.updated - a.updated);
    await idb.put(current); setBusy(false); renderChat(); els.messageInput.focus();
  }
}

async function send() {
  const text = els.messageInput.value.trim();
  if (!text || busy) return;
  if (!(await ensureModel())) return;
  if (!current) {
    current = { id: uid(), title: text.replace(/\s+/g, " ").slice(0, 48), created: Date.now(), updated: Date.now(), messages: [] };
    convs.unshift(current);
  }
  const m = { role: "user", text }; if (pendingImage) m.image = pendingImage;
  current.messages.push(m); current.updated = Date.now();
  els.messageInput.value = ""; autosize(); clearImage();
  await idb.put(current);
  await runAssistant();
}

function autosize() {
  const input = els.messageInput;
  input.style.height = "";
  if (input.scrollHeight > input.clientHeight + 1) input.style.height = (Math.ceil(input.scrollHeight / 3.2) * 0.2).toFixed(1) + "rem";
}
els.messageInput.addEventListener("input", autosize);
els.messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
els.sendButton.addEventListener("click", send);
els.stopButton.addEventListener("click", () => (abort ? abort.abort() : stopper.interrupt()));

function showPreview() {
  els.attachmentPreview.classList.toggle("hidden", !pendingImage);
  els.attachmentPreviewImage.style.backgroundImage = pendingImage ? `url("${pendingImage}")` : "";
}
function clearImage() { pendingImage = null; els.imageFileInput.value = ""; showPreview(); }
function shrink(file, max = 1024) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(tr("error.image"))); };
    img.src = url;
  });
}
els.attachButton.addEventListener("click", () => els.imageFileInput.click());
els.removeAttachmentButton.addEventListener("click", clearImage);
document.addEventListener("dragover", (event) => { if (!els.attachButton.classList.contains("hidden")) event.preventDefault(); });
document.addEventListener("drop", async (event) => {
  event.preventDefault();
  if (els.attachButton.classList.contains("hidden") || els.attachButton.disabled) return;
  try {
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) { pendingImage = await shrink(file); showPreview(); }
  } catch (e) { popups.toast(e.message, { kind: "error" }); }
});
els.imageFileInput.addEventListener("change", async () => {
  const f = els.imageFileInput.files[0]; if (!f) return;
  try { pendingImage = await shrink(f); showPreview(); } catch (e) { popups.toast(e.message, { kind: "error" }); }
});

const toMarkdown = (c) => `# ${c.title}\n\n_${new Date(c.created).toLocaleString(i18n.lang)}_\n\n` +
  c.messages.map((m) => `**${m.role === "user" ? tr("export.you") : "muAI"}:**${m.image ? ` _${tr("export.imageAttached")}_` : ""}\n\n${m.text}`).join("\n\n---\n\n") + "\n";
els.exportButton.addEventListener("click", () => current && components.download(`${current.title.replace(/[^\w-]+/g, "_") || "muai"}.markdown`, toMarkdown(current), "text/markdown"));
account.bind($("account-button"));
settings.listen("muai", async (message) => {
  if (message.type === "modelDeleted") {
    if (loadedDef?.id === message.id && !busy) await unloadModel();
    if (MODEL?.id === message.id) { MODEL = null; showSelected(); renderChat(); }
  } else if (message.type === "imported") {
    convs = (await idb.all()).sort((a, b) => b.updated - a.updated);
    for (const id of message.ids) changed(id);
    renderList();
  } else if (message.type === "chatsDeleted") {
    convs = []; dirty.clear(); removed.clear(); current = null;
    newChat(); renderList();
  }
});

const sideField = i18n.data.settings.fields.find((definition) => definition.id === "sideWidth");
const SIDE = { min: sideField.min, max: sideField.max, def: DEFAULTS.sideWidth };
let sideRem = preferences.sideWidth || SIDE.def;
const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
function setSideWidth(rem) {
  const max = Math.floor(Math.max(SIDE.min, Math.min(SIDE.max, (innerWidth / remPx()) * 0.6)) / 0.2 + 1e-6) * 0.2;
  sideRem = Math.round(Math.min(max, Math.max(SIDE.min, Math.round(rem / 0.2) * 0.2)) * 10) / 10;
  document.documentElement.style.setProperty("--sidebar-width", sideRem.toFixed(1) + "rem");
  els.sidebarResizer.setAttribute("aria-valuenow", sideRem.toFixed(1));
}
const saveSideWidth = () => savePreferences({ sideWidth: Number(sideRem.toFixed(1)) });
els.sidebarResizer.addEventListener("pointerdown", (e) => {
  e.preventDefault(); els.sidebarResizer.setPointerCapture(e.pointerId);
  document.body.classList.add("resizing"); els.sidebarResizer.classList.add("active");
});
els.sidebarResizer.addEventListener("pointermove", (e) => {
  if (els.sidebarResizer.hasPointerCapture(e.pointerId)) {
    const box = els.sidebar.getBoundingClientRect();
    setSideWidth((document.documentElement.dir === "rtl" ? box.right - e.clientX : e.clientX - box.left) / remPx());
  }
});
const endResize = (e) => {
  if (els.sidebarResizer.hasPointerCapture(e.pointerId)) els.sidebarResizer.releasePointerCapture(e.pointerId);
  document.body.classList.remove("resizing"); els.sidebarResizer.classList.remove("active"); saveSideWidth();
};
els.sidebarResizer.addEventListener("pointerup", endResize);
els.sidebarResizer.addEventListener("pointercancel", endResize);
els.sidebarResizer.addEventListener("dblclick", () => { setSideWidth(SIDE.def); saveSideWidth(); });
els.sidebarResizer.addEventListener("keydown", (e) => {
  const flip = document.documentElement.dir === "rtl" ? -1 : 1;
  const to = { ArrowLeft: sideRem - flip, ArrowRight: sideRem + flip, Home: SIDE.min, End: SIDE.max }[e.key];
  if (to === undefined) return;
  e.preventDefault(); setSideWidth(to); saveSideWidth();
});
addEventListener("resize", () => setSideWidth(sideRem));
setSideWidth(sideRem);

const closeSide = () => document.body.classList.remove("sidebar-open");
els.menuButton.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
els.sidebarOverlay.addEventListener("click", closeSide);

i18n.onChange(() => {
  showSelected();
  renderChat();
});

await openWanted();
showSelected(); renderChat();
if (MODEL?.kind === "api") { loadedDef = MODEL; els.modelPicker.classList.add("ok"); }

pullChats();
account.onChange((signedIn) => { store = null; if (signedIn) pullChats(); });
