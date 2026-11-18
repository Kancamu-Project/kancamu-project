// Saved sidebar width, applied as early as this script runs.
try {
  const w = parseFloat(localStorage.getItem("muai.sideWidth"));
  if (w >= 16 && w <= 40) document.documentElement.style.setProperty("--side-width", w.toFixed(1) + "rem");
} catch {}

import {
  AutoProcessor,
  AutoTokenizer,
  AutoModelForCausalLM,
  Gemma4ForConditionalGeneration,
  TextStreamer,
  InterruptableStoppingCriteria,
  load_image,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

// Models are downloaded from Hugging Face and kept in the browser cache.
env.allowLocalModels = false;

// Model catalog. kind "text" = AutoModelForCausalLM, "multi" = Gemma 4 (text + images).
// Every repo below was checked to exist on Hugging Face with q4f16 files; size = total files downloaded.
const MODELS = [
  { id: "onnx-community/gemma-3-270m-it-ONNX", name: "Gemma 3 270M", family: "Gemma", by: "Google", kind: "text", mb: 273,
    tag: "Tiny", desc: "Smallest and fastest. Good for testing and weak devices, basic answer quality." },
  { id: "onnx-community/Qwen3-0.6B-ONNX", name: "Qwen3 0.6B", family: "Qwen", by: "Alibaba", kind: "text", mb: 570,
    tag: "Light", desc: "Small but capable, supports many languages." },
  { id: "onnx-community/gemma-3-1b-it-ONNX", name: "Gemma 3 1B", family: "Gemma", by: "Google", kind: "text", mb: 763,
    tag: "Light", desc: "Balanced speed and quality for everyday chat." },
  { id: "onnx-community/Llama-3.2-1B-Instruct-ONNX", name: "Llama 3.2 1B", family: "Llama", by: "Meta", kind: "text", mb: 1090,
    tag: "Light", desc: "Meta's small model, strongest in English." },
  { id: "onnx-community/Qwen3-1.7B-ONNX", name: "Qwen3 1.7B", family: "Qwen", by: "Alibaba", kind: "text", mb: 1426,
    tag: "Medium", desc: "Smarter than 0.6B, still comfortable on a laptop with an ordinary GPU." },
  { id: "onnx-community/Qwen3-4B-ONNX", name: "Qwen3 4B", family: "Qwen", by: "Alibaba", kind: "text", mb: 2830,
    tag: "Large", desc: "Strong at text and code. Needs a GPU with plenty of memory." },
  { id: "onnx-community/gemma-4-E2B-it-ONNX", name: "Gemma 4 E2B", family: "Gemma", by: "Google", kind: "multi", mb: 3380,
    tag: "Newest", desc: "Google's newest model, can read images. Large download because of embeddings." },
  { id: "onnx-community/gemma-4-E4B-it-ONNX", name: "Gemma 4 E4B", family: "Gemma", by: "Google", kind: "multi", mb: 5180,
    tag: "Newest · heavy", desc: "The smartest Gemma 4 in this catalog and can read images. Very heavy." },
];
const sizeLabel = (mb) => (mb >= 1000 ? (mb / 1000).toFixed(1) + " GB" : mb + " MB");
let MODEL = MODELS.find((m) => m.id === lsGetEarly("muai.model")) || MODELS[2];   // default: Gemma 3 1B
function lsGetEarly(k) { try { return localStorage.getItem(k); } catch { return null; } }

const DEFAULTS = {
  system: "You are muAI, a helpful assistant. Reply in the language the user writes in, concisely and clearly.",
  maxTokens: 1024, temperature: 0.7, ctx: 30,
};
const SUGGESTIONS = [
  "Explain what WebGPU is with a simple example",
  "Write a JavaScript function that sorts an array of objects",
  "Give me 5 name ideas for a coffee shop",
  "Summarize the difference between RAM and storage",
];

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "gpuBadge","modelBadge","modelLabel","loadBtn","progressBox","barFill","progressText","loadErr","intro","chat","input",
  "sendBtn","stopBtn","main","attachBtn","file","preview","previewImg","previewName","removeImg","list","search",
  "newBtn","title","exportBtn","exportAllBtn","importBtn","importFile","clearAllBtn","settingsBtn","settingsDlg",
  "settingsForm","setSystem","setMax","setTemp","setCtx","tempVal","cancelSettings","resetSettings","menuBtn",
  "overlay","chips","loadHint","themeDark","themeLight","side","resizer","changeModelBtn","modelDlg","modelList","closeModelDlg","familyFilter",
].map((k) => [k, $(k)]));
const setModelLabel = (t) => { els.modelLabel.textContent = t; };
function showSelected() {
  $("modelName").textContent = MODEL.name;
  $("modelDesc").textContent = `${MODEL.by} · ${MODEL.kind === "multi" ? "text + images" : "text"} · download ±${sizeLabel(MODEL.mb)}. ${MODEL.desc}`;
  els.loadHint.textContent = "Downloaded from Hugging Face the first time it loads, then kept in the browser cache.";
  els.attachBtn.classList.toggle("hidden", MODEL.kind !== "multi");
  if (!model) setModelLabel(MODEL.name);
}

// ---------- Util ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const icon = (n) => `<span class="icon i-${n}"></span>`;
function toast(msg) {
  const t = document.createElement("span");
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed", bottom: "4.4rem", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center",
    height: "2.4rem", padding: "0 1.2rem", background: "var(--fg)", color: "var(--bg)", fontFamily: "var(--font-mono)", fontWeight: "bold", letterSpacing: "0.1rem", textTransform: "uppercase", zIndex: 50,
  });
  (document.querySelector("dialog[open]") || document.body).appendChild(t); setTimeout(() => t.remove(), 1800);
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Settings ----------
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(lsGet("muai.settings") || "{}") }; } catch {}
const saveSettings = () => lsSet("muai.settings", JSON.stringify(settings));

// ---------- Storage (IndexedDB) ----------
const db = await new Promise((res) => {
  try {
    const r = indexedDB.open("muai", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("convs", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => res(null);
  } catch { res(null); }
});
const tx = (mode) => db.transaction("convs", mode).objectStore("convs");
const idb = {
  all: () => db ? new Promise((res) => { const r = tx("readonly").getAll(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); }) : Promise.resolve([]),
  put: (c) => db ? new Promise((res) => { const r = tx("readwrite").put(c); r.onsuccess = r.onerror = () => res(); }) : Promise.resolve(),
  del: (id) => db ? new Promise((res) => { const r = tx("readwrite").delete(id); r.onsuccess = r.onerror = () => res(); }) : Promise.resolve(),
  clear: () => db ? new Promise((res) => { const r = tx("readwrite").clear(); r.onsuccess = r.onerror = () => res(); }) : Promise.resolve(),
};
if (!db) toast("Browser storage is unavailable, history will not be saved");

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
els.gpuBadge.textContent = gpuOk ? "Active" : "Unavailable";
els.gpuBadge.classList.add(gpuOk ? "ok" : "bad");
if (!gpuOk) {
  els.loadBtn.disabled = true;
  els.loadErr.textContent = "This browser or device does not support WebGPU yet. Try the latest Chrome or Edge on desktop.";
  els.loadErr.classList.remove("hidden");
}

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
      out.push(`<div class="code"><div class="codehead"><span>${esc(b.l || "code")}</span><button class="ghost copycode" type="button">${icon("copy")}<span>Copy</span></button></div><pre><code>${esc(b.c)}</code></pre></div>`);
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
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? "Last 7 days" : "Older";
}
function renderList() {
  const q = els.search.value.trim().toLowerCase();
  const shown = convs.filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text && m.text.toLowerCase().includes(q)));
  els.list.innerHTML = "";
  if (!shown.length) {
    const e = document.createElement("span"); e.className = "empty-list";
    e.textContent = q ? "No matches." : "No history yet. Chats are saved automatically in this browser.";
    els.list.appendChild(e); return;
  }
  let last = "";
  for (const c of shown) {
    const g = groupName(c.updated);
    if (g !== last) { const h = document.createElement("span"); h.className = "grp"; h.textContent = g; els.list.appendChild(h); last = g; }
    const it = document.createElement("div");
    it.className = "item" + (current && current.id === c.id ? " active" : "");
    it.dataset.id = c.id;
    it.innerHTML = `<span class="t"></span><div class="acts"><button data-a="rename" type="button" title="Rename" aria-label="Rename">${icon("edit")}</button><button data-a="delete" type="button" title="Delete" aria-label="Delete">${icon("trash")}</button></div>`;
    it.querySelector(".t").textContent = c.title;
    it.title = new Date(c.updated).toLocaleString("en-US");
    els.list.appendChild(it);
  }
}
els.list.addEventListener("click", async (e) => {
  const it = e.target.closest(".item"); if (!it) return;
  const c = convs.find((x) => x.id === it.dataset.id); if (!c) return;
  const a = e.target.closest("button")?.dataset.a;
  if (a === "rename") {
    const t = prompt("Chat name:", c.title);
    if (t && t.trim()) { c.title = t.trim().slice(0, 80); await idb.put(c); renderList(); if (current === c) els.title.textContent = c.title; }
  } else if (a === "delete") {
    if (busy && current === c) return toast("Wait for the reply to finish");
    if (!confirm(`Delete "${c.title}"?`)) return;
    convs = convs.filter((x) => x !== c); await idb.del(c.id);
    if (current === c) newChat(); else renderList();
  } else openConv(c);
});
els.search.addEventListener("input", renderList);

// ---------- Chat view ----------
function setTitle() {
  els.title.textContent = current ? current.title : "New chat";
  els.exportBtn.classList.toggle("hidden", !current);
}
function makeMsgEl(m, idx) {
  const row = document.createElement("div");
  row.className = "msg " + m.role; row.dataset.idx = idx;
  const b = document.createElement("div"); b.className = "bubble";
  if (m.image) {
    const im = document.createElement("div"); im.className = "att";
    im.style.backgroundImage = `url("${m.image}")`; im.setAttribute("role", "img"); im.setAttribute("aria-label", "attachment");
    b.appendChild(im);
  }
  const body = document.createElement("div");
  if (m.role === "user") body.textContent = m.text;
  else { body.className = "md" + (m.error ? " err" : ""); body.innerHTML = m.error ? esc(m.text) : md(m.text); }
  b.appendChild(body); row.appendChild(b);
  const acts = document.createElement("div"); acts.className = "msg-actions";
  acts.innerHTML = `<button class="ghost" type="button" data-a="copy">${icon("copy")}<span>Copy</span></button>` +
    (m.role === "user"
      ? `<button class="ghost" type="button" data-a="edit">${icon("edit")}<span>Edit</span></button>`
      : `<button class="ghost" type="button" data-a="regen">${icon("refresh")}<span>Regenerate</span></button>`) +
    (m.tps ? `<span class="meta">${m.model ? esc(m.model) + " · " : ""}${m.tps.toFixed(1)} tokens/s</span>` : "");
  row.appendChild(acts);
  return { row, body };
}
function renderChat() {
  els.chat.innerHTML = "";
  const empty = !current || !current.messages.length;
  els.intro.classList.toggle("hidden", !empty);
  els.chat.classList.toggle("hidden", empty);
  els.loadHint.parentElement.classList.toggle("hidden", !!model);
  if (!empty) current.messages.forEach((m, i) => els.chat.appendChild(makeMsgEl(m, i).row));
  els.main.scrollTop = els.main.scrollHeight;
  setTitle(); renderList();
}
els.chat.addEventListener("click", async (e) => {
  const btn = e.target.closest("button"); if (!btn) return;
  if (btn.classList.contains("copycode")) {
    await navigator.clipboard?.writeText(btn.closest(".code").querySelector("code").innerText).catch(() => {});
    const label = btn.querySelector("span:not(.icon)");
    label.textContent = "Copied"; setTimeout(() => (label.textContent = "Copy"), 1200); return;
  }
  const a = btn.dataset.a; if (!a) return;
  const idx = +btn.closest(".msg").dataset.idx, m = current.messages[idx];
  if (a === "copy") { await navigator.clipboard?.writeText(m.text).catch(() => {}); toast("Copied"); return; }
  if (busy) return toast("Wait for the reply to finish");
  if (a === "edit") {
    current.messages.splice(idx); current.updated = Date.now(); await idb.put(current);
    els.input.value = m.text; pendingImage = m.image && loadedDef?.kind === "multi" ? m.image : null;
    showPreview(); autosize(); renderChat(); els.input.focus();
  } else if (a === "regen") {
    if (!model) return toast("Load a model first");
    current.messages.splice(idx); await runAssistant();
  }
});

function newChat() {
  if (busy) return;
  current = null; renderChat(); closeSide(); els.input.focus();
}
function openConv(c) {
  if (busy) return toast("Wait for the reply to finish");
  current = c; renderChat(); closeSide();
}
els.newBtn.addEventListener("click", newChat);
els.chips.innerHTML = "";
for (const s of SUGGESTIONS) {
  const b = document.createElement("button"); b.type = "button"; b.innerHTML = "<span></span>"; b.firstChild.textContent = s;
  b.addEventListener("click", () => { if (!model) return toast("Load a model first"); els.input.value = s; send(); });
  els.chips.appendChild(b);
}

// ---------- Loading the model ----------
async function unloadModel() {
  try { await model?.dispose?.(); } catch (e) { console.warn("dispose failed", e); }
  model = null; processor = null; tokenizer = null; loadedDef = null;
  els.modelBadge.classList.remove("ok");
  els.input.disabled = true; els.sendBtn.disabled = true; els.input.placeholder = "Load a model first…";
  els.loadBtn.classList.remove("hidden");
}

async function loadModel() {
  if (busy) return;
  const def = MODEL;
  els.loadBtn.disabled = true; els.changeModelBtn.disabled = true;
  els.loadErr.classList.add("hidden"); els.progressBox.classList.remove("hidden");
  els.barFill.style.width = "0%"; els.progressText.textContent = "Preparing…";
  setModelLabel("loading " + def.name + "…");
  const files = new Map();
  const onProgress = (info) => {
    if (info.status === "progress" && info.file) {
      files.set(info.file, { loaded: info.loaded, total: info.total });
      let l = 0, t = 0; for (const f of files.values()) { l += f.loaded; t += f.total; }
      const pct = t ? (l / t) * 100 : 0;
      els.barFill.style.width = pct.toFixed(1) + "%";
      els.progressText.textContent = `Loading ${(l / 1e6).toFixed(0)} / ${(t / 1e6).toFixed(0)} MB (${pct.toFixed(0)}%)`;
    } else if (info.status === "ready") els.progressText.textContent = "Preparing GPU…";
  };
  try {
    const opts = { dtype: "q4f16", device: "webgpu", progress_callback: onProgress };
    if (def.kind === "multi") {
      processor = await AutoProcessor.from_pretrained(def.id);
      tokenizer = processor.tokenizer;
      model = await Gemma4ForConditionalGeneration.from_pretrained(def.id, opts);
    } else {
      tokenizer = await AutoTokenizer.from_pretrained(def.id);
      model = await AutoModelForCausalLM.from_pretrained(def.id, opts);
    }
    loadedDef = def;
    els.progressText.textContent = "Warming up model…";
    await generate([{ role: "user", content: def.kind === "multi" ? [{ type: "text", text: "Hi" }] : "Hi" }], [], { maxTokens: 1, temperature: 0 });
    lsSet("muai.model", def.id); lsSet("muai.autoload", "1");
    setModelLabel(def.name); els.modelBadge.classList.add("ok");
    els.progressBox.classList.add("hidden"); els.loadBtn.classList.add("hidden");
    els.input.disabled = false; els.sendBtn.disabled = false; els.input.placeholder = "Type a message…";
    renderChat(); els.input.focus();
  } catch (e) {
    console.error(e);
    try { await model?.dispose?.(); } catch {}
    model = null; processor = null; tokenizer = null; loadedDef = null;
    setModelLabel(def.name);
    els.loadErr.textContent = `Failed to load ${def.name}: ` + (e?.message || e) + " — try a smaller model.";
    els.loadErr.classList.remove("hidden");
    els.loadBtn.disabled = false; els.progressBox.classList.add("hidden");
  } finally {
    els.changeModelBtn.disabled = false;
  }
}
els.loadBtn.addEventListener("click", loadModel);

// ---------- Model picker ----------
let familyPick = "All";
function renderFamilyFilter() {
  els.familyFilter.innerHTML = "";
  const fams = ["All", ...new Set(MODELS.map((m) => m.family))];
  for (const f of fams) {
    const n = f === "All" ? MODELS.length : MODELS.filter((m) => m.family === f).length;
    const b = document.createElement("button");
    b.type = "button"; b.innerHTML = "<span></span>"; b.firstChild.textContent = `${f} ${n}`;
    b.classList.toggle("active", f === familyPick);
    b.addEventListener("click", () => { familyPick = f; renderFamilyFilter(); renderModelList(); });
    els.familyFilter.appendChild(b);
  }
}
function renderModelList() {
  els.modelList.innerHTML = "";
  for (const m of MODELS.filter((x) => familyPick === "All" || x.family === familyPick)) {
    const card = document.createElement("div");
    const isLoaded = loadedDef && loadedDef.id === m.id, isSel = MODEL.id === m.id;
    card.className = "mcard" + (isSel ? " sel" : "");
    card.innerHTML = `<div class="info"><div class="nm"><span></span><span class="tag"></span><span class="tag vis"></span></div><span class="ds"></span></div><span class="sz"></span><button type="button"><span></span></button>`;
    const [nm, tag, vis] = card.querySelectorAll(".nm span");
    nm.textContent = m.name; tag.textContent = m.tag; vis.textContent = m.kind === "multi" ? "text + images" : "text";
    card.querySelector(".ds").textContent = `${m.by} · ${m.desc}`;
    card.querySelector(".sz").textContent = "±" + sizeLabel(m.mb);
    const btn = card.querySelector("button");
    btn.firstChild.textContent = isLoaded ? "In use" : "Select & load";
    btn.disabled = isLoaded || busy; if (!isLoaded) btn.classList.add("outline");
    btn.addEventListener("click", () => chooseModel(m));
    els.modelList.appendChild(card);
  }
}
async function chooseModel(m) {
  if (busy) return toast("Wait for the reply to finish");
  const seen = lsGet("muai.seen." + m.id) === "1";
  if (!seen && m.mb >= 1000 && !confirm(`${m.name} will download about ${sizeLabel(m.mb)} from Hugging Face. Continue?`)) return;
  els.modelDlg.close();
  if (model) await unloadModel();
  MODEL = m; lsSet("muai.model", m.id); showSelected(); renderChat();
  await loadModel();
  if (loadedDef && loadedDef.id === m.id) lsSet("muai.seen." + m.id, "1");
}
function openModelDlg() { renderFamilyFilter(); renderModelList(); els.modelDlg.showModal(); }
els.modelBadge.addEventListener("click", openModelDlg);
els.changeModelBtn.addEventListener("click", openModelDlg);
els.closeModelDlg.addEventListener("click", () => els.modelDlg.close());

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
  if (settings.system.trim()) msgs.push({ role: "system", content: settings.system.trim() });
  let hist = current.messages.filter((m) => !m.error);
  hist = hist.slice(-settings.ctx);
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
  els.sendBtn.classList.toggle("hidden", v); els.stopBtn.classList.toggle("hidden", !v);
  els.input.disabled = v || !model; els.attachBtn.disabled = v;
}

async function runAssistant() {
  renderChat();
  const m = { role: "assistant", text: "" };
  const idx = current.messages.length;
  const { row, body } = makeMsgEl(m, idx);
  row.querySelector(".msg-actions").classList.add("hidden");
  body.classList.add("cursor"); els.chat.appendChild(row);
  els.main.scrollTop = els.main.scrollHeight;
  setBusy(true);
  let acc = "", raf = 0;
  const paint = () => { raf = 0; body.innerHTML = md(acc); body.classList.add("cursor"); els.main.scrollTop = els.main.scrollHeight; };
  try {
    const { msgs, imgs } = buildMessages();
    const r = await generate(msgs, imgs, { maxTokens: settings.maxTokens, temperature: settings.temperature }, (t) => { acc += t; if (!raf) raf = requestAnimationFrame(paint); });
    m.text = r.text.trim() || "(empty reply)"; m.tps = r.tps; m.model = loadedDef.name;
  } catch (e) {
    console.error(e); m.text = "Something went wrong: " + (e?.message || e); m.error = true;
  } finally {
    cancelAnimationFrame(raf);
    current.messages.push(m); current.updated = Date.now();
    convs.sort((a, b) => b.updated - a.updated);
    await idb.put(current); setBusy(false); renderChat(); els.input.focus();
  }
}

async function send() {
  const text = els.input.value.trim();
  if (!text || busy || !model) return;
  if (!current) {
    current = { id: uid(), title: text.replace(/\s+/g, " ").slice(0, 48), created: Date.now(), updated: Date.now(), messages: [] };
    convs.unshift(current);
  }
  const m = { role: "user", text }; if (pendingImage) m.image = pendingImage;
  current.messages.push(m); current.updated = Date.now();
  els.input.value = ""; autosize(); clearImage();
  await idb.put(current);
  await runAssistant();
}

// ---------- Input ----------
// Textarea height is computed in rem (multiples of 0.2rem), from 2.4rem up to 10rem.
function autosize() {
  els.input.style.height = "auto";
  const rem = Math.min(10, Math.max(2.4, Math.ceil((els.input.scrollHeight + 2) / 3.2) * 0.2));
  els.input.style.height = rem.toFixed(1) + "rem";
}
els.input.addEventListener("input", autosize);
els.input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
els.sendBtn.addEventListener("click", send);
els.stopBtn.addEventListener("click", () => stopper.interrupt());

// ---------- Image attachment (downscaled so history does not balloon) ----------
function showPreview() {
  els.preview.classList.toggle("hidden", !pendingImage);
  els.previewImg.style.backgroundImage = pendingImage ? `url("${pendingImage}")` : "";
}
function clearImage() { pendingImage = null; els.file.value = ""; showPreview(); }
function shrink(file, max = 1024) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Image could not be read")); };
    img.src = url;
  });
}
els.attachBtn.addEventListener("click", () => els.file.click());
els.removeImg.addEventListener("click", clearImage);
els.file.addEventListener("change", async () => {
  const f = els.file.files[0]; if (!f) return;
  try { pendingImage = await shrink(f); showPreview(); } catch (e) { toast(e.message); }
});

// ---------- Export / import / delete ----------
const toMarkdown = (c) => `# ${c.title}\n\n_${new Date(c.created).toLocaleString("en-US")}_\n\n` +
  c.messages.map((m) => `**${m.role === "user" ? "You" : "muAI"}:**${m.image ? " _(image attached)_" : ""}\n\n${m.text}`).join("\n\n---\n\n") + "\n";
els.exportBtn.addEventListener("click", () => current && download(`${current.title.replace(/[^\w-]+/g, "_") || "muai"}.md`, toMarkdown(current), "text/markdown"));
els.exportAllBtn.addEventListener("click", () => convs.length ? download("muai-history.json", JSON.stringify(convs), "application/json") : toast("No history yet"));
els.importBtn.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", async () => {
  const f = els.importFile.files[0]; els.importFile.value = ""; if (!f) return;
  try {
    const data = JSON.parse(await f.text()); if (!Array.isArray(data)) throw new Error();
    let n = 0;
    for (const c of data) {
      if (!c || !Array.isArray(c.messages) || typeof c.title !== "string") continue;
      const clean = {
        id: uid(), title: c.title.slice(0, 80), created: +c.created || Date.now(), updated: +c.updated || Date.now(),
        messages: c.messages.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
          .map((m) => ({ role: m.role, text: m.text, ...(typeof m.image === "string" && m.image.startsWith("data:image/") ? { image: m.image } : {}), ...(m.error ? { error: true } : {}) })),
      };
      convs.push(clean); await idb.put(clean); n++;
    }
    convs.sort((a, b) => b.updated - a.updated); renderList(); toast(`${n} chats imported`);
  } catch { toast("Invalid import file"); }
});
els.clearAllBtn.addEventListener("click", async () => {
  if (busy) return toast("Wait for the reply to finish");
  if (!convs.length) return toast("No history yet");
  if (!confirm(`Delete all ${convs.length} chats? This cannot be undone.`)) return;
  convs = []; await idb.clear(); els.settingsDlg.close(); newChat();
});

// ---------- Settings dialog ----------
function fillSettings() {
  els.setSystem.value = settings.system; els.setMax.value = settings.maxTokens;
  els.setTemp.value = settings.temperature; els.tempVal.textContent = settings.temperature; els.setCtx.value = settings.ctx;
}
els.settingsBtn.addEventListener("click", () => { fillSettings(); els.settingsDlg.showModal(); });
els.setTemp.addEventListener("input", () => (els.tempVal.textContent = els.setTemp.value));
els.cancelSettings.addEventListener("click", () => els.settingsDlg.close());
els.resetSettings.addEventListener("click", () => { settings = { ...DEFAULTS }; fillSettings(); });
els.settingsForm.addEventListener("submit", () => {
  const clamp = (v, a, b, d) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d);
  settings = {
    system: els.setSystem.value,
    maxTokens: clamp(els.setMax.value, 64, 4096, DEFAULTS.maxTokens),
    temperature: clamp(els.setTemp.value, 0, 1.5, DEFAULTS.temperature),
    ctx: clamp(els.setCtx.value, 2, 60, DEFAULTS.ctx),
  };
  saveSettings(); toast("Settings saved");
});

// ---------- Theme ----------
function applyTheme(t, save) {
  document.documentElement.dataset.theme = t;
  els.themeDark.classList.toggle("active", t === "dark");
  els.themeLight.classList.toggle("active", t === "light");
  if (save) lsSet("theme", t);
}
els.themeDark.addEventListener("click", () => applyTheme("dark", true));
els.themeLight.addEventListener("click", () => applyTheme("light", true));
applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark", false);

// ---------- Resizable sidebar ----------
// Width is kept in rem (multiples of 0.2rem), clamped to 16rem-40rem and at most 60% of the window.
const SIDE = { min: 16, max: 40, def: 24 };
let sideRem = parseFloat(lsGet("muai.sideWidth")) || SIDE.def;
const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
function setSideWidth(rem) {
  const max = Math.floor(Math.max(SIDE.min, Math.min(SIDE.max, (innerWidth / remPx()) * 0.6)) / 0.2 + 1e-6) * 0.2;
  sideRem = Math.round(Math.min(max, Math.max(SIDE.min, Math.round(rem / 0.2) * 0.2)) * 10) / 10;
  document.documentElement.style.setProperty("--side-width", sideRem.toFixed(1) + "rem");
  els.resizer.setAttribute("aria-valuenow", sideRem.toFixed(1));
}
const saveSideWidth = () => lsSet("muai.sideWidth", sideRem.toFixed(1));
els.resizer.addEventListener("pointerdown", (e) => {
  e.preventDefault(); els.resizer.setPointerCapture(e.pointerId);
  document.body.classList.add("resizing"); els.resizer.classList.add("active");
});
els.resizer.addEventListener("pointermove", (e) => {
  if (els.resizer.hasPointerCapture(e.pointerId)) setSideWidth((e.clientX - els.side.getBoundingClientRect().left) / remPx());
});
const endResize = (e) => {
  if (els.resizer.hasPointerCapture(e.pointerId)) els.resizer.releasePointerCapture(e.pointerId);
  document.body.classList.remove("resizing"); els.resizer.classList.remove("active"); saveSideWidth();
};
els.resizer.addEventListener("pointerup", endResize);
els.resizer.addEventListener("pointercancel", endResize);
els.resizer.addEventListener("dblclick", () => { setSideWidth(SIDE.def); saveSideWidth(); });
els.resizer.addEventListener("keydown", (e) => {
  const to = { ArrowLeft: sideRem - 1, ArrowRight: sideRem + 1, Home: SIDE.min, End: SIDE.max }[e.key];
  if (to === undefined) return;
  e.preventDefault(); setSideWidth(to); saveSideWidth();
});
addEventListener("resize", () => setSideWidth(sideRem));
setSideWidth(sideRem);

// ---------- Mobile sidebar ----------
const closeSide = () => document.body.classList.remove("side-open");
els.menuBtn.addEventListener("click", () => document.body.classList.toggle("side-open"));
els.overlay.addEventListener("click", closeSide);

// ---------- Start ----------
showSelected(); renderChat();
// Auto-load only the last model that loaded successfully.
if (gpuOk && lsGet("muai.autoload") === "1" && lsGet("muai.model")) loadModel();
