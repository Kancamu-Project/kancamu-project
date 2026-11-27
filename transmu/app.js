import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
import { i18n, popups, account, settings, urlState, components } from "../assets/js/shared.js";
import appData from "./data.js";

env.allowLocalModels = false;

await i18n.load(appData);
i18n.selects();

const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "model-select", "source-language", "target-language", "swap-button", "source-text", "source-count", "clear-button", "target-text", "copy-button",
  "translate-button", "stop-button", "status",
  "account-button"
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

const { translationLanguages: languages, models, engine, settings: { defaults }, sentenceMarks, noSpaceLanguages, punctuation } = i18n.data;
const preferences = settings.get("transmu", defaults);
const TEXT_LIMIT = 500;
const SENTENCE = new RegExp(`(?:[^${sentenceMarks}\\n]|[${sentenceMarks}](?=\\d))+[${sentenceMarks}]*\\s*|[${sentenceMarks}]+`, "g");

const known = (code, fallback) => (languages.some((language) => language.code === code) ? code : fallback);
const state = {
  model: models.find((model) => model.id === (urlState.get("model") || preferences.model)) || models[0],
  source: known(urlState.get("from") || preferences.source, defaults.source),
  target: known(urlState.get("to") || preferences.target, defaults.target),
  engines: new Map(),
  busy: false,
  stop: false,
};

const say = components.status(els.status);
const languageOf = (code) => languages.find((language) => language.code === code);

function stepsOf(from, to) {
  const model = state.model;
  if (from === to) return [];
  if (model.codes) return [{ key: model.id, modelId: model.model, options: { src_lang: model.codes[from], tgt_lang: model.codes[to] } }];
  const pair = (a, b) => ({ key: `${model.id}-${a}-${b}`, modelId: model.modelTemplate.replace("{from}", a).replace("{to}", b), options: {} });
  return model.pairs.includes(`${from}-${to}`) ? [pair(from, to)] : [pair(from, model.pivot), pair(model.pivot, to)];
}

async function loadTranslator({ key, modelId }) {
  if (state.engines.has(key)) return state.engines.get(key);
  const files = new Map();
  let note = null;
  const show = (text, fraction) => (note ? note.set(text, fraction) : (note = popups.toast(text, { duration: 0, progress: fraction ?? 0 })));
  const progress_callback = (info) => {
    if (info.status === "progress" && info.file) {
      files.set(info.file, { loaded: info.loaded, total: info.total });
      let loaded = 0, total = 0;
      for (const file of files.values()) { loaded += file.loaded; total += file.total; }
      const percent = total ? Math.round((loaded / total) * 100) : 0;
      show(tr("status.loadingModel", { model: modelId.split("/").pop(), percent }), percent / 100);
    } else if (info.status === "ready") show(tr("status.preparingModel"));
  };
  try {
    const translator = await pipeline("translation", modelId, { device: engine.device, dtype: state.model.dtype, progress_callback });
    state.engines.set(key, translator);
    return translator;
  } finally {
    note?.close();
  }
}

function pieces(text) {
  const result = [];
  text.split("\n").forEach((line, lineIndex) => {
    for (const sentence of line.match(SENTENCE) || []) if (sentence.trim()) result.push({ lineIndex, text: sentence.trim() });
  });
  return result;
}

const punctuate = (text, code) => (punctuation[code] || []).reduce((result, [pattern, replacement]) => result.replace(new RegExp(pattern, "g"), replacement), text);

async function translate() {
  if (state.busy) return;
  const text = els.sourceText.value.trim();
  if (!text) return void popups.toast(tr("error.empty"), { kind: "error" });
  const steps = stepsOf(state.source, state.target);
  if (!steps.length) { showTarget(text); return void popups.toast(tr("status.same"), { kind: "info" }); }
  state.busy = true;
  state.stop = false;
  setBusy(true);
  const started = performance.now();
  let note = null;
  try {
    const translators = [];
    for (const step of steps) translators.push(await loadTranslator(step));
    const parts = pieces(text);
    const lines = [];
    const separator = noSpaceLanguages.includes(state.target) ? "" : " ";
    let done = 0;
    for (const part of parts) {
      if (state.stop) break;
      const working = tr("status.translating", { done: done + 1, total: parts.length });
      if (note) note.set(working, done / parts.length); else note = popups.toast(working, { duration: 0, progress: done / parts.length });
      let translated = part.text;
      for (const [index, translator] of translators.entries()) translated = (await translator(translated, { ...steps[index].options, max_new_tokens: engine.maxNewTokens }))[0].translation_text;
      (lines[part.lineIndex] ||= []).push(punctuate(translated, state.target));
      done++;
      showTarget(Array.from(text.split("\n"), (_, index) => (lines[index] || []).join(separator)).join("\n"));
    }
    note?.close();
    popups.toast(tr(state.stop ? "status.stopped" : "status.done", { seconds: i18n.number((performance.now() - started) / 1000, { maximumFractionDigits: 1 }), done, total: parts.length }), { kind: state.stop ? "warning" : "success" });
  } catch (error) {
    console.error(error);
    popups.toast(tr("error.failed", { message: error.message || error }), { kind: "error" });
  } finally {
    note?.close();
    state.busy = false;
    setBusy(false);
  }
}
function setBusy(busy) {
  els.translateButton.classList.toggle("hidden", busy);
  els.stopButton.classList.toggle("hidden", !busy);
}
function showTarget(text) {
  els.targetText.textContent = text;
  els.copyButton.disabled = !text;
}
els.translateButton.addEventListener("click", translate);
els.stopButton.addEventListener("click", () => { state.stop = true; });
els.sourceText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); translate(); }
});
els.sourceText.addEventListener("input", () => { renderCount(); urlState.set({ text: els.sourceText.value.length <= TEXT_LIMIT ? els.sourceText.value : "" }); });
function renderCount() {
  els.sourceCount.textContent = tr("count", { count: i18n.number(els.sourceText.value.length) });
}

const savePreferences = () => {
  settings.set("transmu", { model: state.model.id, source: state.source, target: state.target });
  urlState.set({ model: state.model.id, from: state.source, to: state.target });
};
settings.onChange("transmu", defaults, (changed) => {
  if (state.busy) return;
  state.model = models.find((model) => model.id === changed.model) || state.model;
  state.source = known(changed.source, state.source);
  state.target = known(changed.target, state.target);
  buildModels();
  buildLanguages();
});

settings.listen("transmu", (message) => { if (message.type === "modelDeleted") state.engines.clear(); });

function buildModels() {
  els.modelSelect.replaceChildren(...models.map((model) => Object.assign(document.createElement("option"), { value: model.id, textContent: `${model.name} — ${i18n.pick(model.hint)}` })));
  els.modelSelect.value = state.model.id;
}
els.modelSelect.addEventListener("change", () => {
  if (state.busy) { els.modelSelect.value = state.model.id; return; }
  state.model = models.find((model) => model.id === els.modelSelect.value);
  savePreferences();
});

function buildLanguages() {
  for (const select of [els.sourceLanguage, els.targetLanguage]) {
    select.replaceChildren(...languages.map((language) => Object.assign(document.createElement("option"), { value: language.code, textContent: language.name })));
  }
  els.sourceLanguage.value = state.source;
  els.targetLanguage.value = state.target;
  els.targetText.dir = languageOf(state.target).dir;
}
function chooseLanguages(source, target) {
  state.source = source; state.target = target;
  savePreferences();
  buildLanguages();
}
els.sourceLanguage.addEventListener("change", () => chooseLanguages(els.sourceLanguage.value, els.sourceLanguage.value === state.target ? state.source : state.target));
els.targetLanguage.addEventListener("change", () => chooseLanguages(els.targetLanguage.value === state.source ? state.target : state.source, els.targetLanguage.value));
els.swapButton.addEventListener("click", () => {
  if (state.busy) return;
  const translation = els.targetText.textContent;
  chooseLanguages(state.target, state.source);
  if (translation) { els.sourceText.value = translation; renderCount(); showTarget(""); }
});
els.clearButton.addEventListener("click", () => {
  if (state.busy) return;
  els.sourceText.value = "";
  showTarget("");
  renderCount();
  say(tr("status.idle"));
  els.sourceText.focus();
});

els.copyButton.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(els.targetText.textContent); popups.toast(tr("toast.copied")); } catch (error) { popups.toast(tr("error.failed", { message: error.message }), { kind: "error" }); }
});

account.bind(els.accountButton);

function renderTexts() {
  buildModels();
  els.targetText.dataset.placeholder = tr("target.placeholder");
  renderCount();
  if (!state.busy && !els.targetText.textContent) say(tr("status.idle"));
}
i18n.onChange(renderTexts);

buildLanguages();
els.sourceText.value = urlState.get("text");
renderTexts();
