// Saved sidebar width, applied as early as this script runs.
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

// Models are downloaded from Hugging Face and kept in the browser cache.
env.allowLocalModels = false;

await i18n.load();
i18n.selects();
const tr = (key, params) => i18n.t(key, params);

// The model list and the default settings are in data.json (models, settings).
// kind "text" = AutoModelForCausalLM, "multi" = Gemma 4 (text + images).
const { models: MODELS, settings: { defaults: DEFAULTS } } = i18n.data;
const sizeLabel = (mb) => (mb >= 1000 ? (mb / 1000).toFixed(1) + " GB" : mb + " MB");
let MODEL = MODELS.find((m) => m.id === settings.get("muai", DEFAULTS).model) || null;   // null until the user chooses one (the choice is one of the settings)


const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "model-picker","load-status","progress-box","progress-fill","progress-text","load-error","chat","message-input",
  "send-button","stop-button","chat-area","attach-button","image-file-input","attachment-preview","attachment-preview-image","attachment-preview-name","remove-attachment-button","chat-list","chat-search",
  "new-chat-button","chat-title","export-button","menu-button",
  "sidebar-overlay","main","welcome-message","sidebar","sidebar-resizer",
].map((id) => [id.replace(/-([a-z])/g, (m, c) => c.toUpperCase()), $(id)]));   // els.modelPicker is the element with the id model-picker
// The model is chosen in a select. While a model loads, its option says so.
function renderModelPicker(label) {
  const options = MODELS.map((m) => {
    const option = document.createElement("option");
    option.value = m.id; option.textContent = `${m.name} (${sizeLabel(m.mb)})`;
    return option;
  });
  if (!MODEL) {   // nothing chosen yet: the first option asks for a choice
    const ask = document.createElement("option");
    ask.value = ""; ask.textContent = tr("model.select");
    options.unshift(ask);
  }
  els.modelPicker.replaceChildren(...options);
  els.modelPicker.value = MODEL ? MODEL.id : "";
  els.modelPicker.classList.toggle("unchosen", !MODEL);   // red until a model is chosen
  els.modelPicker.classList.toggle("loading", loading);   // yellow while it loads
  els.modelPicker.classList.toggle("loading-model", loading);   // yellow while it loads
  if (label) els.modelPicker.selectedOptions[0].textContent = label;
  els.modelPicker.disabled = busy || loading;
}
function showSelected() {
  els.attachButton.classList.toggle("hidden", MODEL?.kind !== "multi");
  renderModelPicker();
}

// ---------- Util ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const icon = (n) => `<span class="icon icon-${n}"></span>`;
// A question in the dialog shared by every web (assets/dialog.js): true or false, or the text the user typed (null when cancelled).
const ask = (options) => dialogs.ask(options);
function toast(msg) {
  const t = document.createElement("span");
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed", bottom: "4.4rem", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center",
    height: "2.4rem", padding: "0 1.2rem", background: "var(--fg)", color: "var(--bg)", fontWeight: "bold", letterSpacing: "0.1rem", textTransform: "uppercase", zIndex: 50,
  });
  (document.querySelector("dialog[open]") || document.body).appendChild(t); setTimeout(() => t.remove(), 1800);
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Settings ----------
// They are set in the account web (the settings button opens it); muAI only reads them, and follows a change.
let preferences = settings.get("muai", DEFAULTS);
// The page and the account web both set the model and the width of the sidebar: they write the same settings, and each follows the other.
const savePreferences = (values) => { preferences = { ...preferences, ...values }; settings.set("muai", preferences); };
settings.onChange("muai", DEFAULTS, (changed) => {
  const modelChanged = changed.model !== preferences.model, widthChanged = changed.sideWidth !== preferences.sideWidth;
  preferences = changed;
  if (widthChanged) setSideWidth(changed.sideWidth);
  if (modelChanged) {
    const chosen = MODELS.find((m) => m.id === changed.model);
    if (chosen) chooseModel(chosen); else if (!changed.model) { MODEL = null; showSelected(); renderChat(); }
  }
});

// ---------- Storage (IndexedDB) ----------
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
  save: put,   // saved here only: the sync does not hear of it
  drop: del,
  put: async (c) => { await put(c); changed(c.id); },
  del: async (id) => { await del(id); removedChat(id); },
  clear: async () => { for (const c of await idb.all()) removedChat(c.id); if (db) await new Promise((res) => { const r = tx("readwrite").clear(); r.onsuccess = r.onerror = () => res(); }); },
};
if (!db) toast(tr("toast.storage"));

// ---------- Sync: signed in, the chats are also kept on the muai branch of the user's storage (assets/storage.js) ----------
// conversations/<id>.json  one file per chat, loaded when the chat is opened
// files/<sha256>           the files attached to the chats, named by their hash, so a file is kept once whatever chat it came from
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

// A chat as it is kept in the storage: the attached images become files named by their hash.
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

// The chats of the storage show in the list (only the names of the files are read). A chat is read when it is opened.
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
        const created = parseInt(id.slice(0, 8), 36) || Date.now();   // the id starts with the time the chat was made
        const chat = { id, title: new Date(created).toLocaleString(i18n.lang), created, updated: created, messages: [], unloaded: true, sha: null, remoteSha: file.sha };
        convs.push(chat); await idb.save(chat); listChanged = true;
      } else if (file.sha !== local.sha && !dirty.has(id)) {
        local.stale = true; local.remoteSha = file.sha; await idb.save(local);   // changed elsewhere: read again when opened
      }
    }
    for (const c of [...convs]) {
      if (c.sha && !remoteIds.has(c.id) && !dirty.has(c.id)) {   // deleted elsewhere
        convs = convs.filter((x) => x !== c); await idb.drop(c.id);
        if (current === c) current = null;
        listChanged = true;
      } else if (!c.sha && !c.unloaded && !remoteIds.has(c.id)) dirty.add(c.id);   // never saved to the storage yet
    }
    if (listChanged) { convs.sort((a, b) => b.updated - a.updated); renderList(); renderChat(); }
    scheduleSync();
  } catch (error) { console.warn("[sync]", error); }
}

// Reads a chat from the storage (and its files), when it was only named in the list or was changed elsewhere.
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
let current = null;          // active chat (null = not created yet)
let processor = null, tokenizer = null, model = null;
let loadedDef = null;        // definition of the model currently loaded
let pendingImage = null;     // data URL
let busy = false;
const stopper = new InterruptableStoppingCriteria();

// ---------- WebGPU ----------
let gpuOk = false;
try { if (navigator.gpu && (await navigator.gpu.requestAdapter())) gpuOk = true; } catch {}
function renderGpu() {
  if (!gpuOk) els.loadError.textContent = tr("gpu.unsupported");
}
if (!gpuOk) {
  els.loadStatus.classList.remove("hidden");
  els.loadError.classList.remove("hidden");
}
renderGpu();

// ---------- Light markdown (safe: all text is escaped first) ----------
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

// ---------- History list ----------
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
    it.innerHTML = `<span class="chat-list-title"></span><div class="actions"><button data-a="rename" type="button" title="${tr("chat.rename")}" aria-label="${tr("chat.rename")}">${icon("edit")}</button><button data-a="delete" type="button" title="${tr("chat.delete")}" aria-label="${tr("chat.delete")}">${icon("trash")}</button></div>`;
    it.querySelector(".chat-list-title").textContent = c.title;
    it.title = new Date(c.updated).toLocaleString(i18n.lang);
    it.tabIndex = 0;   // Tab reaches every chat, Enter opens it
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
    if (busy && current === c) return toast(tr("toast.wait"));
    if (!(await ask({ text: tr("confirm.delete", { title: c.title }), ok: tr("chat.delete") }))) return;
    convs = convs.filter((x) => x !== c); await idb.del(c.id);
    if (current === c) newChat(); else renderList();
  } else openConv(c);
});
els.chatSearch.addEventListener("input", renderList);
autocomplete.attach(els.chatSearch, { suggestions: () => convs.map((chat) => chat.title) });

// ---------- Chat view ----------
function setTitle() {
  els.chatTitle.textContent = current ? current.title : tr("title.new");
  els.exportButton.classList.toggle("hidden", !current);
}
function makeMsgEl(m, idx) {
  const row = document.createElement("div");
  row.className = "message " + m.role; row.dataset.idx = idx;
  const b = document.createElement("div"); b.className = "bubble selectable";
  if (m.image) {
    const im = document.createElement("div"); im.className = "attachment";
    im.style.backgroundImage = `url("${m.image}")`; im.setAttribute("role", "img"); im.setAttribute("aria-label", tr("msg.attachment"));
    b.appendChild(im);
  }
  const body = document.createElement("div");
  if (m.role === "user") body.textContent = m.text;
  else { body.className = "markdown" + (m.error ? " error" : ""); body.innerHTML = m.error ? esc(m.text) : md(m.text); }
  b.appendChild(body); row.appendChild(b);
  const acts = document.createElement("div"); acts.className = "message-actions";
  acts.innerHTML = `<button class="ghost" type="button" data-a="copy">${icon("copy")}<span>${tr("msg.copy")}</span></button>` +
    (m.role === "user"
      ? `<button class="ghost" type="button" data-a="edit">${icon("edit")}<span>${tr("msg.edit")}</span></button>`
      : `<button class="ghost" type="button" data-a="regen">${icon("refresh")}<span>${tr("msg.regen")}</span></button>`) +
    (m.tps ? `<span class="model-meta">${m.model ? esc(m.model) + " · " : ""}${tr("msg.tps", { n: m.tps.toFixed(1) })}</span>` : "");
  row.appendChild(acts);
  return { row, body };
}
function renderChat() {
  els.chat.innerHTML = "";
  const empty = !current || !current.messages.length;
  els.welcomeMessage.classList.toggle("hidden", !empty);
  els.main.classList.toggle("welcoming", empty);   // no messages yet: the welcome and the message box sit in the middle
  els.chat.classList.toggle("hidden", empty);
  if (!empty) current.messages.forEach((m, i) => els.chat.appendChild(makeMsgEl(m, i).row));
  els.chatArea.scrollTop = els.chatArea.scrollHeight;
  setTitle(); renderList();
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
  if (a === "copy") { await navigator.clipboard?.writeText(m.text).catch(() => {}); toast(tr("toast.copied")); return; }
  if (busy) return toast(tr("toast.wait"));
  if (a === "edit") {
    current.messages.splice(idx); current.updated = Date.now(); await idb.put(current);
    els.messageInput.value = m.text; pendingImage = m.image && loadedDef?.kind === "multi" ? m.image : null;
    showPreview(); autosize(); renderChat(); els.messageInput.focus();
  } else if (a === "regen") {
    if (!(await ensureModel())) return;
    current.messages.splice(idx); await runAssistant();
  }
});

function newChat() {
  if (busy) return;
  current = null; renderChat(); closeSide(); els.messageInput.focus();
}
async function openConv(c) {
  if (busy) return toast(tr("toast.wait"));
  await loadChat(c);
  current = c; renderChat(); closeSide();
}
els.newChatButton.addEventListener("click", newChat);

// ---------- Loading the model ----------
async function unloadModel() {
  try { await model?.dispose?.(); } catch (e) { console.warn("dispose failed", e); }
  model = null; processor = null; tokenizer = null; loadedDef = null;
  els.modelPicker.classList.remove("ok");
}

// The chat works at once: the first message loads the chosen model if it is not loaded yet.
async function ensureModel() {
  if (model) return true;
  if (!MODEL) { toast(tr("model.none")); els.modelPicker.focus(); return false; }
  if (!gpuOk) { toast(tr("gpu.unsupported")); return false; }
  if (loading) { toast(tr("toast.wait")); return false; }
  await loadModel();
  return !!model;
}

let loading = false;
async function loadModel() {
  if (busy || loading) return;
  loading = true;
  const def = MODEL;
  els.loadStatus.classList.remove("hidden");
  els.loadError.classList.add("hidden"); els.progressBox.classList.remove("hidden");
  els.progressFill.style.width = "0%"; els.progressText.textContent = tr("progress.preparing");
  renderModelPicker(tr("load.loading", { name: def.name }));
  const files = new Map();
  const onProgress = (info) => {
    if (info.status === "progress" && info.file) {
      files.set(info.file, { loaded: info.loaded, total: info.total });
      let l = 0, t = 0; for (const f of files.values()) { l += f.loaded; t += f.total; }
      const pct = t ? (l / t) * 100 : 0;
      els.progressFill.style.width = pct.toFixed(1) + "%";
      els.progressText.textContent = tr("load.progress", { loaded: (l / 1e6).toFixed(0), total: (t / 1e6).toFixed(0), pct: pct.toFixed(0) });
    } else if (info.status === "ready") els.progressText.textContent = tr("load.gpu");
  };
  try {
    const opts = { dtype: def.dtype ?? i18n.data.defaultDtype, device: "webgpu", progress_callback: onProgress };   // a model may name its own dtype in data.json
    if (def.kind === "multi") {
      processor = await AutoProcessor.from_pretrained(def.id);
      if (!processor.tokenizer) processor = await Gemma4Processor.from_pretrained(def.id);   // the QAT repos do not name the processor class in preprocessor_config.json, so AutoProcessor makes one without a tokenizer
      tokenizer = processor.tokenizer;
      model = await Gemma4ForConditionalGeneration.from_pretrained(def.id, opts);
    } else {
      tokenizer = await AutoTokenizer.from_pretrained(def.id);
      model = await AutoModelForCausalLM.from_pretrained(def.id, opts);
    }
    loadedDef = def;
    els.progressText.textContent = tr("load.warm");
    await generate([{ role: "user", content: def.kind === "multi" ? [{ type: "text", text: "Hi" }] : "Hi" }], [], { maxTokens: 1, temperature: 0 });
    savePreferences({ model: def.id }); lsSet("muai.autoload", "1");
    els.modelPicker.classList.add("ok");
    els.progressBox.classList.add("hidden"); els.loadStatus.classList.add("hidden");
    renderChat(); els.messageInput.focus();
  } catch (e) {
    console.error(e);
    try { await model?.dispose?.(); } catch {}
    model = null; processor = null; tokenizer = null; loadedDef = null;
    els.loadError.textContent = tr("load.failed", { name: def.name, message: e?.message || e });
    els.loadError.classList.remove("hidden");
    els.progressBox.classList.add("hidden");
  } finally {
    loading = false; renderModelPicker();
  }
}

// ---------- Model picker ----------
async function chooseModel(m) {
  if (busy) { renderModelPicker(); return toast(tr("toast.wait")); }
  const seen = lsGet("muai.seen." + m.id) === "1";
  if (!seen && m.mb >= 1000 && !(await ask({ text: tr("picker.confirm", { name: m.name, size: sizeLabel(m.mb) }), ok: tr("picker.select") }))) { renderModelPicker(); return; }
  if (model) await unloadModel();
  MODEL = m; savePreferences({ model: m.id }); showSelected(); renderChat();
  await loadModel();
  if (loadedDef && loadedDef.id === m.id) lsSet("muai.seen." + m.id, "1");
}
els.modelPicker.addEventListener("change", () => {
  const chosen = MODELS.find((m) => m.id === els.modelPicker.value);
  if (chosen) chooseModel(chosen); else renderModelPicker();
});

// ---------- Generate ----------
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
  const msgs = [], imgs = [];
  if (preferences.system.trim()) msgs.push({ role: "system", content: preferences.system.trim() });
  let hist = current.messages.filter((m) => !m.error);
  hist = hist.slice(-preferences.ctx);
  while (hist.length && hist[0].role !== "user") hist.shift();   // context must start with a user message
  const multi = loadedDef.kind === "multi";   // text-only models: message content is a string, images are ignored
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
  const paint = () => { raf = 0; body.innerHTML = md(acc); body.classList.add("cursor"); els.chatArea.scrollTop = els.chatArea.scrollHeight; };
  try {
    const { msgs, imgs } = buildMessages();
    const r = await generate(msgs, imgs, { maxTokens: preferences.maxTokens, temperature: preferences.temperature }, (t) => { acc += t; if (!raf) raf = requestAnimationFrame(paint); });
    m.text = r.text.trim() || tr("msg.empty"); m.tps = r.tps; m.model = loadedDef.name;
  } catch (e) {
    console.error(e); m.text = tr("msg.error", { message: e?.message || e }); m.error = true;
  } finally {
    cancelAnimationFrame(raf);
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

// ---------- Input ----------
// One line keeps the height of the CSS (var(--height), like the buttons beside it). Only a text of more lines makes the box taller,
// in rem (multiples of 0.2rem); the CSS stops it at twice var(--height), and a longer text scrolls.
function autosize() {
  const input = els.messageInput;
  input.style.height = "";   // back to the height of one line
  if (input.scrollHeight > input.clientHeight + 1) input.style.height = (Math.ceil(input.scrollHeight / 3.2) * 0.2).toFixed(1) + "rem";
}
els.messageInput.addEventListener("input", autosize);
els.messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
els.sendButton.addEventListener("click", send);
els.stopButton.addEventListener("click", () => stopper.interrupt());

// ---------- Image attachment (downscaled so history does not balloon) ----------
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
// An image dropped on the page is attached, like the one the attach button chooses
document.addEventListener("dragover", (event) => { if (!els.attachButton.classList.contains("hidden")) event.preventDefault(); });
document.addEventListener("drop", async (event) => {
  event.preventDefault();
  if (els.attachButton.classList.contains("hidden") || els.attachButton.disabled) return;
  try {
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) { pendingImage = await shrink(file); showPreview(); }
  } catch (e) { toast(e.message); }
});
els.imageFileInput.addEventListener("change", async () => {
  const f = els.imageFileInput.files[0]; if (!f) return;
  try { pendingImage = await shrink(f); showPreview(); } catch (e) { toast(e.message); }
});

// ---------- Export / import / delete ----------
const toMarkdown = (c) => `# ${c.title}\n\n_${new Date(c.created).toLocaleString(i18n.lang)}_\n\n` +
  c.messages.map((m) => `**${m.role === "user" ? tr("export.you") : "muAI"}:**${m.image ? ` _${tr("export.imageAttached")}_` : ""}\n\n${m.text}`).join("\n\n---\n\n") + "\n";
els.exportButton.addEventListener("click", () => current && download(`${current.title.replace(/[^\w-]+/g, "_") || "muai"}.markdown`, toMarkdown(current), "text/markdown"));
// ---------- Settings ----------
// The settings, the downloaded models, and the data are managed in the account web (the account button opens it). muAI shows what is left after it did something.
// The sign-in is the account web, opened by assets/account.js.
account.bind($("account-button"));
settings.listen("muai", async (message) => {
  if (message.type === "modelDeleted") {
    if (loadedDef?.id === message.id && !busy) await unloadModel();   // the files are gone, so the model in use is let go
    if (MODEL?.id === message.id) { MODEL = null; showSelected(); renderChat(); }
  } else if (message.type === "imported") {
    convs = (await idb.all()).sort((a, b) => b.updated - a.updated);
    for (const id of message.ids) changed(id);   // the imported chats go to the storage too
    renderList();
  } else if (message.type === "chatsDeleted") {
    convs = []; dirty.clear(); removed.clear(); current = null;
    newChat(); renderList();
  }
});

// ---------- Resizable sidebar ----------
// Width is kept in rem (multiples of 0.2rem), clamped to 16rem-40rem and at most 60% of the window.
const sideField = i18n.data.settings.fields.find((definition) => definition.id === "sideWidth");   // its limits are in data.json
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

// ---------- Mobile sidebar ----------
const closeSide = () => document.body.classList.remove("sidebar-open");
els.menuButton.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
els.sidebarOverlay.addEventListener("click", closeSide);

// ---------- Language ----------
i18n.onChange(() => {
  renderGpu(); showSelected();
  renderChat();
});

// ---------- Start ----------
showSelected(); renderChat();
// Auto-load only the last model that loaded successfully.
if (gpuOk && lsGet("muai.autoload") === "1" && preferences.model) loadModel();

// Signed in (now or later): bring the chats of the storage here.
pullChats();
account.onChange((signedIn) => { store = null; if (signedIn) pullChats(); });
