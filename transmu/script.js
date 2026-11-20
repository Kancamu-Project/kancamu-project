// Transmu: translates text with AI models that run in the browser (Transformers.js). The text never leaves the device.
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

env.allowLocalModels = false;   // a model is downloaded from Hugging Face once and kept in the browser cache

await i18n.load();
document.documentElement.style.setProperty("--brand", i18n.data.brandColor);   // the colour of Transmu (from its icon), written in data.json
i18n.selects();

const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "model-select", "source-language", "target-language", "swap-button", "source-text", "source-count", "clear-button", "target-text", "copy-button",
  "translate-button", "stop-button", "progress", "progress-fill", "status",
  "account-button"
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

// The languages, the models, and how a text is cut are in data.json.
const { translationLanguages: languages, models, engine, settings: { defaults }, sentenceMarks, noSpaceLanguages, punctuation } = i18n.data;
const preferences = settings.get("transmu", defaults);   // the model and the two languages: set here and in the account web
const SENTENCE = new RegExp(`(?:[^${sentenceMarks}\\n]|[${sentenceMarks}](?=\\d))+[${sentenceMarks}]*\\s*|[${sentenceMarks}]+`, "g");   // a mark with a digit after it (3.5) does not end a sentence

const known = (code, fallback) => (languages.some((language) => language.code === code) ? code : fallback);
const state = {
  model: models.find((model) => model.id === preferences.model) || models[0],   // the model that is chosen
  source: known(preferences.source, defaults.source),
  target: known(preferences.target, defaults.target),
  engines: new Map(),   // the models that are loaded: "en-zh" -> translator
  busy: false,
  stop: false,
};

function say(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("error", isError);
}
function setProgress(percent) {
  els.progress.classList.toggle("hidden", percent === null);
  if (percent !== null) els.progressFill.style.width = `${percent}%`;
}
const languageOf = (code) => languages.find((language) => language.code === code);

/* ---------- the models: one for each direction, and English in the middle when neither language is English ---------- */
// The models to run, one after the other, for a translation, with the options of each (a model that knows every language is told the two languages).
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
  const progress_callback = (info) => {
    if (info.status === "progress" && info.file) {
      files.set(info.file, { loaded: info.loaded, total: info.total });
      let loaded = 0, total = 0;
      for (const file of files.values()) { loaded += file.loaded; total += file.total; }
      const percent = total ? Math.round((loaded / total) * 100) : 0;
      setProgress(percent);
      say(tr("status.loadingModel", { model: modelId.split("/").pop(), percent }));
    } else if (info.status === "ready") say(tr("status.preparingModel"));
  };
  const translator = await pipeline("translation", modelId, { device: engine.device, dtype: state.model.dtype, progress_callback });
  state.engines.set(key, translator);
  return translator;
}

/* ---------- cutting a text into sentences ---------- */
// A model drops sentences when it is given more than one, so every sentence is translated on its own; every line stays a line.
function pieces(text) {
  const result = [];
  text.split("\n").forEach((line, lineIndex) => {
    for (const sentence of line.match(SENTENCE) || []) if (sentence.trim()) result.push({ lineIndex, text: sentence.trim() });
  });
  return result;
}

// The punctuation of the language of the translation.
const punctuate = (text, code) => (punctuation[code] || []).reduce((result, [pattern, replacement]) => result.replace(new RegExp(pattern, "g"), replacement), text);

/* ---------- translating ---------- */
async function translate() {
  if (state.busy) return;
  const text = els.sourceText.value.trim();
  if (!text) return say(tr("error.empty"), true);
  const steps = stepsOf(state.source, state.target);
  if (!steps.length) { showTarget(text); return say(tr("status.same")); }
  state.busy = true;
  state.stop = false;
  setBusy(true);
  const started = performance.now();
  try {
    const translators = [];
    for (const step of steps) translators.push(await loadTranslator(step));
    setProgress(null);
    const parts = pieces(text);
    const lines = [];   // the translated pieces of every line
    const separator = noSpaceLanguages.includes(state.target) ? "" : " ";
    let done = 0;
    for (const part of parts) {
      if (state.stop) break;
      say(tr("status.translating", { done: done + 1, total: parts.length }));
      setProgress(Math.round((done / parts.length) * 100));
      let translated = part.text;
      for (const [index, translator] of translators.entries()) translated = (await translator(translated, { ...steps[index].options, max_new_tokens: engine.maxNewTokens }))[0].translation_text;
      (lines[part.lineIndex] ||= []).push(punctuate(translated, state.target));
      done++;
      showTarget(Array.from(text.split("\n"), (_, index) => (lines[index] || []).join(separator)).join("\n"));
    }
    say(tr(state.stop ? "status.stopped" : "status.done", { seconds: i18n.number((performance.now() - started) / 1000, { maximumFractionDigits: 1 }), done, total: parts.length }));
  } catch (error) {
    console.error(error);
    say(tr("error.failed", { message: error.message || error }), true);
  } finally {
    setProgress(null);
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
els.sourceText.addEventListener("input", renderCount);
function renderCount() {
  els.sourceCount.textContent = tr("count", { count: i18n.number(els.sourceText.value.length) });
}

/* ---------- the settings: the page and the account web both set them, and each follows the other ---------- */
const savePreferences = () => settings.set("transmu", { model: state.model.id, source: state.source, target: state.target });
settings.onChange("transmu", defaults, (changed) => {
  if (state.busy) return;
  state.model = models.find((model) => model.id === changed.model) || state.model;
  state.source = known(changed.source, state.source);
  state.target = known(changed.target, state.target);
  buildModels();
  buildLanguages();
});

// The account web deleted the files of a model: what is loaded is let go, and it downloads again when it is used.
settings.listen("transmu", (message) => { if (message.type === "modelDeleted") state.engines.clear(); });

/* ---------- the model that is chosen ---------- */
function buildModels() {
  els.modelSelect.replaceChildren(...models.map((model) => Object.assign(document.createElement("option"), { value: model.id, textContent: `${model.name} — ${i18n.pick(model.hint)}` })));
  els.modelSelect.value = state.model.id;
}
els.modelSelect.addEventListener("change", () => {
  if (state.busy) { els.modelSelect.value = state.model.id; return; }
  state.model = models.find((model) => model.id === els.modelSelect.value);
  savePreferences();
});

/* ---------- the two languages ---------- */
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
// Choosing the language that is on the other side swaps them.
els.sourceLanguage.addEventListener("change", () => chooseLanguages(els.sourceLanguage.value, els.sourceLanguage.value === state.target ? state.source : state.target));
els.targetLanguage.addEventListener("change", () => chooseLanguages(els.targetLanguage.value === state.source ? state.target : state.source, els.targetLanguage.value));
// The swap button turns the languages around and puts the translation in as the new text.
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

/* ---------- copying the translation ---------- */
function toast(text) {
  const note = document.createElement("div");
  note.className = "toast";
  note.textContent = text;
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 3000);
}
els.copyButton.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(els.targetText.textContent); toast(tr("toast.copied")); } catch (error) { say(tr("error.failed", { message: error.message }), true); }
});

/* ---------- the settings ---------- */
account.bind(els.accountButton);   // the profile and the settings are in the account web

function renderTexts() {
  buildModels();
  els.targetText.dataset.placeholder = tr("target.placeholder");
  renderCount();
  if (!state.busy && !els.targetText.textContent) say(tr("status.idle"));
}
i18n.onChange(renderTexts);

buildLanguages();
renderTexts();
