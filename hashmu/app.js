import { i18n, popups, account, settings, urlState, transfer, components } from "../assets/js/shared.js";
import appData from "./data.js";

await i18n.load(appData);
i18n.selects();

const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "views", "hash-panel", "encrypt-panel", "generate-panel", "encode-panel",
  "source-text", "source-file", "hash-text", "hash-file", "choose-button", "file-name", "file-input", "hash-key", "hash-format", "hash-compare", "hash-results",
  "mode-encrypt", "mode-decrypt", "encrypt-passphrase", "encrypt-input", "encrypt-run", "encrypt-run-label", "encrypt-hint", "encrypt-output", "encrypt-copy",
  "generate-type", "password-options", "generate-length", "length-value", "generate-lowercase", "generate-uppercase", "generate-digits", "generate-symbols", "generate-run", "generate-output", "generate-entropy", "generate-copy",
  "encode-format", "encode-input", "encode-run", "decode-run", "encode-output", "encode-copy",
  "status", "account-button"
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

const { algorithms, formats, charsets, generateTypes, encodings, limits, settings: { defaults } } = i18n.data;
const TABS = ["hash", "encrypt", "generate", "encode"];
const preferences = () => settings.get("hashmu", defaults);
const keep = (patch) => settings.set("hashmu", { ...preferences(), ...patch });

const state = {
  tab: TABS.includes(urlState.get("tab")) ? urlState.get("tab") : TABS[0],
  source: "text",
  file: null,
  mode: "encrypt",
  type: generateTypes.some((type) => type.id === urlState.get("type")) ? urlState.get("type") : generateTypes[0].id,
  output: "",
  lastMatch: "",
};

const say = components.status(els.status);
const toast = (text, kind) => popups.toast(text, kind ? { kind } : undefined);
const fail = (text) => toast(text, "error");
const debounced = (fn) => { let timer = 0; return () => { clearTimeout(timer); timer = setTimeout(fn, limits.debounceMs); }; };
const copy = async (text) => {
  try { await navigator.clipboard.writeText(text); toast(tr("toast.copied")); } catch (error) { fail(tr("error.failed", { message: error.message })); }
};

const utf8 = (text) => new TextEncoder().encode(text);
const toHex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const toBase64 = (bytes) => { let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); };
const fromBase64 = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
const fromHex = (text) => {
  const clean = text.replace(/\s/g, "");
  if (!/^([0-9a-fA-F]{2})*$/.test(clean)) throw new Error("hex");
  return Uint8Array.from(clean.match(/../g) || [], (pair) => parseInt(pair, 16));
};
const formatBytes = (bytes, format) => (format === "base64" ? toBase64(bytes) : toHex(bytes));

function md5(bytes) {
  const K = Uint32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const length = bytes.length;
  const padded = new Uint8Array((((length + 8) >> 6) << 6) + 64);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (length * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(length / 2 ** 29), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = Uint32Array.from({ length: 16 }, (_, i) => view.getUint32(offset + i * 4, true));
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + words[g]) >>> 0;
      A = D; D = C; C = B;
      const shift = S[(i >> 4) * 4 + (i & 3)];
      B = (B + ((F << shift) | (F >>> (32 - shift)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((word, i) => out.setUint32(i * 4, word, true));
  return new Uint8Array(out.buffer);
}

async function digestOf(algorithm, bytes, key) {
  if (key) {
    if (!algorithm.subtle) return null;
    const imported = await crypto.subtle.importKey("raw", utf8(key), { name: "HMAC", hash: algorithm.id }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", imported, bytes));
  }
  return algorithm.subtle ? new Uint8Array(await crypto.subtle.digest(algorithm.id, bytes)) : md5(bytes);
}

let hashRun = 0;
async function renderHashes() {
  const run = ++hashRun;
  let bytes;
  if (state.source === "text") {
    if (!els.hashText.value) return els.hashResults.replaceChildren();
    bytes = utf8(els.hashText.value);
  } else {
    if (!state.file) return els.hashResults.replaceChildren();
    if (state.file.size > limits.maxFileMB * 1048576) { els.hashResults.replaceChildren(); return fail(tr("error.tooBig", { size: components.formatSize(limits.maxFileMB * 1048576) })); }
    const reading = popups.toast(tr("hash.reading", { name: state.file.name }), { kind: "info", duration: 0 });
    try { bytes = new Uint8Array(await state.file.arrayBuffer()); } catch (error) { return fail(tr("error.read", { message: error.message })); } finally { reading.close(); }
    if (run !== hashRun) return;
  }
  const key = els.hashKey.value;
  const digests = [];
  for (const algorithm of algorithms) digests.push([algorithm, await digestOf(algorithm, bytes, key)]);
  if (run !== hashRun) return;
  drawHashes(digests, key);
}

let lastDigests = [];
function drawHashes(digests = lastDigests, key = els.hashKey.value) {
  lastDigests = digests;
  const format = els.hashFormat.value;
  const wanted = els.hashCompare.value.trim().replace(/[\s:]/g, "");
  let matched = "";
  els.hashResults.replaceChildren(...digests.map(([algorithm, bytes]) => {
    const row = document.createElement("div");
    row.className = "result-row";
    const name = Object.assign(document.createElement("span"), { className: "result-name", textContent: key ? `HMAC-${algorithm.name}` : algorithm.name });
    const value = Object.assign(document.createElement("span"), { className: "result-value selectable" });
    const note = (text) => value.append(Object.assign(document.createElement("span"), { className: "result-note", textContent: text }));
    const copyButton = Object.assign(document.createElement("button"), { type: "button", className: "ghost square", title: tr("copy") });
    copyButton.setAttribute("aria-label", tr("copy"));
    copyButton.innerHTML = '<span class="icon icon-copy"></span>';
    if (!bytes) {
      value.textContent = "—";
      note(tr("hash.noHmac"));
      copyButton.disabled = true;
    } else {
      value.dir = "ltr";
      value.textContent = formatBytes(bytes, format);
      if (algorithm.insecure && !key) note(tr("hash.insecure"));
      copyButton.addEventListener("click", () => copy(formatBytes(bytes, format)));
      if (wanted && (wanted.toLowerCase() === toHex(bytes) || wanted === toBase64(bytes))) { row.classList.add("match"); matched = name.textContent; }
    }
    row.append(name, value, copyButton);
    return row;
  }));
  if (matched && matched !== state.lastMatch) toast(tr("hash.match", { name: matched }), "success");
  state.lastMatch = matched;
}

const hashLater = debounced(renderHashes);
els.hashText.addEventListener("input", hashLater);
els.hashKey.addEventListener("input", hashLater);
els.hashCompare.addEventListener("input", debounced(() => drawHashes()));
els.hashFormat.addEventListener("change", () => { keep({ format: els.hashFormat.value }); drawHashes(); });

function chooseSource(source) {
  state.source = source;
  els.sourceText.classList.toggle("on", source === "text");
  els.sourceFile.classList.toggle("on", source === "file");
  els.hashText.classList.toggle("hidden", source !== "text");
  els.hashFile.classList.toggle("hidden", source !== "file");
  renderHashes();
}
els.sourceText.addEventListener("click", () => chooseSource("text"));
els.sourceFile.addEventListener("click", () => chooseSource("file"));
els.chooseButton.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => {
  state.file = els.fileInput.files[0] || null;
  els.fileName.textContent = state.file ? `${state.file.name} · ${components.formatSize(state.file.size)}` : tr("hash.noFile");
  els.fileInput.value = "";
  renderHashes();
});
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("drop", async (event) => {
  event.preventDefault();
  if (state.tab !== "hash") return;
  const [file] = await transfer.take(event);
  if (!file) return;
  state.file = file;
  els.fileName.textContent = `${file.name} · ${components.formatSize(file.size)}`;
  chooseSource("file");
});

const VERSION = 1, SALT = 16, IV = 12;
async function keyFrom(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey("raw", utf8(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function encryptText(text, passphrase) {
  const iterations = Number(preferences().iterations);
  const salt = crypto.getRandomValues(new Uint8Array(SALT));
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(passphrase, salt, iterations), utf8(text)));
  const out = new Uint8Array(5 + SALT + IV + cipher.length);
  out[0] = VERSION;
  new DataView(out.buffer).setUint32(1, iterations);
  out.set(salt, 5); out.set(iv, 5 + SALT); out.set(cipher, 5 + SALT + IV);
  return toBase64(out);
}
async function decryptText(encoded, passphrase) {
  let bytes;
  try { bytes = fromBase64(encoded.trim()); } catch { throw Object.assign(new Error("format"), { code: "format" }); }
  const iterations = bytes.length > 4 ? new DataView(bytes.buffer).getUint32(1) : 0;
  if (bytes.length < 5 + SALT + IV + 16 || bytes[0] !== VERSION || iterations < limits.minIterations || iterations > limits.maxIterations) throw Object.assign(new Error("format"), { code: "format" });
  const salt = bytes.slice(5, 5 + SALT), iv = bytes.slice(5 + SALT, 5 + SALT + IV), cipher = bytes.slice(5 + SALT + IV);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await keyFrom(passphrase, salt, iterations), cipher));
  } catch { throw Object.assign(new Error("wrong"), { code: "wrong" }); }
}

function renderEncryptTexts() {
  els.encryptRunLabel.textContent = tr(`encrypt.${state.mode}`);
  els.encryptInput.placeholder = tr(`encrypt.placeholder.${state.mode}`);
  els.encryptHint.textContent = tr("encrypt.hint", { iterations: i18n.number(Number(preferences().iterations)) });
}
function chooseMode(mode) {
  state.mode = mode;
  els.modeEncrypt.classList.toggle("on", mode === "encrypt");
  els.modeDecrypt.classList.toggle("on", mode === "decrypt");
  els.encryptOutput.textContent = "";
  els.encryptCopy.disabled = true;
  renderEncryptTexts();
}
els.modeEncrypt.addEventListener("click", () => chooseMode("encrypt"));
els.modeDecrypt.addEventListener("click", () => chooseMode("decrypt"));
els.encryptRun.addEventListener("click", async () => {
  const passphrase = els.encryptPassphrase.value, input = els.encryptInput.value;
  if (!passphrase) return fail(tr("error.noPassphrase"));
  if (!input.trim()) return fail(tr("error.noText"));
  els.encryptRun.disabled = true;
  try {
    const output = state.mode === "encrypt" ? await encryptText(input, passphrase) : await decryptText(input, passphrase);
    els.encryptOutput.textContent = output;
    els.encryptCopy.disabled = false;
    toast(tr(`encrypt.done.${state.mode}`), "success");
  } catch (error) {
    els.encryptOutput.textContent = "";
    els.encryptCopy.disabled = true;
    fail(error.code === "wrong" ? tr("error.wrong") : error.code === "format" ? tr("error.format") : tr("error.failed", { message: error.message }));
  } finally {
    els.encryptRun.disabled = false;
  }
});
els.encryptCopy.addEventListener("click", () => copy(els.encryptOutput.textContent));

function randomBelow(max) {
  const limit = Math.floor(2 ** 32 / max) * max;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % max;
}
function generate() {
  const type = generateTypes.find((item) => item.id === state.type);
  let output = "", bits = 0;
  if (type.id === "password") {
    const chosen = ["lowercase", "uppercase", "digits", "symbols"].filter((name) => els[`generate${name[0].toUpperCase()}${name.slice(1)}`].checked);
    if (!chosen.length) { state.output = ""; els.generateOutput.textContent = ""; els.generateEntropy.textContent = ""; els.generateCopy.disabled = true; return fail(tr("error.noCharacters")); }
    const length = Number(els.generateLength.value);
    const pool = chosen.map((name) => charsets[name]).join("");
    const picked = chosen.map((name) => charsets[name][randomBelow(charsets[name].length)]);
    while (picked.length < length) picked.push(pool[randomBelow(pool.length)]);
    for (let i = picked.length - 1; i > 0; i--) { const j = randomBelow(i + 1); [picked[i], picked[j]] = [picked[j], picked[i]]; }
    output = picked.join("");
    bits = Math.floor(length * Math.log2(pool.length));
  } else if (type.id === "uuid") {
    output = crypto.randomUUID();
    bits = 122;
  } else {
    const bytes = crypto.getRandomValues(new Uint8Array(type.bytes));
    output = type.id === "token" ? toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : toHex(bytes);
    bits = type.bytes * 8;
  }
  state.output = output;
  els.generateOutput.textContent = output;
  els.generateEntropy.textContent = tr("generate.entropy", { bits: i18n.number(bits) });
  els.generateCopy.disabled = false;
}

function buildTypes() {
  els.generateType.replaceChildren(...generateTypes.map((type) => Object.assign(document.createElement("option"), { value: type.id, textContent: tr(`generate.type.${type.id}`) })));
  els.generateType.value = state.type;
}
function renderOptions() {
  const values = preferences();
  els.generateLength.value = values.length;
  els.lengthValue.textContent = i18n.number(Number(values.length));
  for (const name of ["lowercase", "uppercase", "digits", "symbols"]) els[`generate${name[0].toUpperCase()}${name.slice(1)}`].checked = !!values[name];
  els.generateLength.dispatchEvent(new Event("input"));
  els.passwordOptions.classList.toggle("hidden", state.type !== "password");
}
els.generateType.addEventListener("change", () => { state.type = els.generateType.value; urlState.set({ type: state.type }); renderOptions(); generate(); });
els.generateLength.addEventListener("input", () => { els.lengthValue.textContent = i18n.number(Number(els.generateLength.value)); });
els.generateLength.addEventListener("change", () => { keep({ length: Number(els.generateLength.value) }); generate(); });
for (const name of ["lowercase", "uppercase", "digits", "symbols"]) {
  els[`generate${name[0].toUpperCase()}${name.slice(1)}`].addEventListener("change", (event) => { keep({ [name]: event.target.checked }); generate(); });
}
els.generateRun.addEventListener("click", generate);
els.generateCopy.addEventListener("click", () => copy(state.output));

const encoders = {
  base64: { encode: (text) => toBase64(utf8(text)), decode: (text) => new TextDecoder("utf-8", { fatal: true }).decode(fromBase64(text.trim())) },
  base64url: { encode: (text) => toBase64(utf8(text)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), decode: (text) => new TextDecoder("utf-8", { fatal: true }).decode(fromBase64(text.trim())) },
  hex: { encode: (text) => toHex(utf8(text)), decode: (text) => new TextDecoder("utf-8", { fatal: true }).decode(fromHex(text)) },
  url: { encode: (text) => encodeURIComponent(text), decode: (text) => decodeURIComponent(text) },
};
function transform(direction) {
  const encoding = encodings.find((item) => item.id === els.encodeFormat.value);
  if (!els.encodeInput.value) return fail(tr("error.noText"));
  try {
    els.encodeOutput.textContent = encoders[encoding.id][direction](els.encodeInput.value);
    els.encodeCopy.disabled = false;
  } catch {
    els.encodeOutput.textContent = "";
    els.encodeCopy.disabled = true;
    fail(tr("error.invalid", { format: encoding.name }));
  }
}
els.encodeRun.addEventListener("click", () => transform("encode"));
els.decodeRun.addEventListener("click", () => transform("decode"));
els.encodeCopy.addEventListener("click", () => copy(els.encodeOutput.textContent));

function renderTabs() {
  const buttons = TABS.map((id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("value", id);
    button.textContent = tr(`tab.${id}`);
    return button;
  });
  const tabs = components.make("tabs", { value: state.tab }, buttons);
  tabs.addEventListener("change", (event) => { state.tab = event.detail.value; urlState.set({ tab: state.tab }); showTab(); });
  els.views.replaceChildren(tabs);
}
function showTab() {
  for (const id of TABS) els[`${id}Panel`].classList.toggle("hidden", id !== state.tab);
  say(tr(`status.${state.tab}`));
  if (state.tab === "generate" && !state.output) generate();
}

function buildSelects() {
  els.hashFormat.replaceChildren(...formats.map((format) => Object.assign(document.createElement("option"), { value: format.id, textContent: format.name })));
  els.hashFormat.value = preferences().format;
  els.encodeFormat.replaceChildren(...encodings.map((encoding) => Object.assign(document.createElement("option"), { value: encoding.id, textContent: encoding.name })));
}

settings.onChange("hashmu", defaults, () => { els.hashFormat.value = preferences().format; renderOptions(); renderEncryptTexts(); drawHashes(); });

account.bind(els.accountButton);

function renderTexts() {
  renderTabs();
  buildSelects();
  buildTypes();
  renderOptions();
  renderEncryptTexts();
  els.fileName.textContent = state.file ? `${state.file.name} · ${components.formatSize(state.file.size)}` : tr("hash.noFile");
  showTab();
  drawHashes();
}
i18n.onChange(renderTexts);
renderTexts();
