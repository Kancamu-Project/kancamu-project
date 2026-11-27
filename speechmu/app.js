import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
import { i18n, popups, account, settings, urlState, components } from "../assets/js/shared.js";
import appData from "./data.js";

env.allowLocalModels = false;

await i18n.load(appData);
i18n.selects();

const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "views", "listen-panel", "speak-panel", "model-select", "listen-language", "choose-button", "record-button", "record-label", "listen-source", "file-input",
  "listen-text", "listen-count", "copy-listen", "save-text", "save-subtitles",
  "speak-language", "voice-select", "speak-text", "speak-count", "clear-button", "speak-button", "stop-button", "save-audio",
  "status", "account-button"
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

const { speechLanguages: languages, models, engine, speech, settings: { defaults } } = i18n.data;
const preferences = settings.get("speechmu", defaults);
const TEXT_LIMIT = 500;
const fromUrl = (name, fallback) => urlState.get(name) || fallback;
const AUTO = "auto";
const languageOf = (code) => languages.find((language) => language.code === code);
const known = (code, fallback) => (languageOf(code) ? code : fallback);

const state = {
  view: urlState.get("tab") === "speak" ? "speak" : "listen",
  model: models.find((model) => model.id === fromUrl("model", preferences.model)) || models[0],
  listen: [AUTO, ...languages.map((language) => language.code)].includes(fromUrl("listen", preferences.listen)) ? fromUrl("listen", preferences.listen) : AUTO,
  speak: known(fromUrl("speak", preferences.speak), defaults.speak),
  voice: "",
  transcribers: new Map(),
  speakers: new Map(),
  voices: [],
  busy: false,
  recording: null,
  transcript: null,
  audio: null,
  output: null,
};

const say = components.status(els.status);
let working = null;
const work = (text) => (working ? working.set(text) : (working = popups.toast(text, { kind: "info", duration: 0 })));
const rest = () => { working?.close(); working = null; };
const done = (text) => popups.toast(text);
const fail = (text) => { rest(); popups.toast(text, { kind: "error" }); };
const formatTime = (seconds) => {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
};

async function load(task, model, options) {
  const files = new Map();
  let note = null;
  const show = (text, fraction) => (note ? note.set(text, fraction) : (note = popups.toast(text, { duration: 0, progress: fraction ?? 0 })));
  const progress_callback = (info) => {
    if (info.status === "progress" && info.file) {
      files.set(info.file, { loaded: info.loaded, total: info.total });
      let loaded = 0, total = 0;
      for (const file of files.values()) { loaded += file.loaded; total += file.total; }
      const percent = total ? Math.round((loaded / total) * 100) : 0;
      show(tr("status.loadingModel", { model: model.split("/").pop(), percent }), percent / 100);
    } else if (info.status === "ready") show(tr("status.preparingModel"));
  };
  try {
    return await pipeline(task, model, { device: engine.device, progress_callback, ...options });
  } finally {
    note?.close();
  }
}

function renderTabs() {
  const buttons = ["listen", "speak"].map((id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("value", id);
    button.textContent = tr(`tab.${id}`);
    return button;
  });
  const tabs = components.make("tabs", { value: state.view }, buttons);
  tabs.addEventListener("change", (event) => { state.view = event.detail.value; urlState.set({ tab: state.view }); showView(); });
  els.views.replaceChildren(tabs);
}
function showView() {
  els.listenPanel.classList.toggle("hidden", state.view !== "listen");
  els.speakPanel.classList.toggle("hidden", state.view !== "speak");
  idle();
}
function idle() {
  if (!state.busy) say(tr(state.view === "listen" ? "status.idleListen" : "status.idleSpeak"));
}

async function decode(blob) {
  const context = new AudioContext({ sampleRate: engine.sampleRate });
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < samples.length; index++) samples[index] += data[index] / buffer.numberOfChannels;
    }
    return { samples, seconds: buffer.duration };
  } finally {
    context.close();
  }
}

async function loadTranscriber() {
  const model = state.model;
  if (!state.transcribers.has(model.id)) state.transcribers.set(model.id, await load("automatic-speech-recognition", model.model, { dtype: model.dtype }));
  return state.transcribers.get(model.id);
}

const stamp = (seconds) => {
  const total = Math.max(0, Math.round(seconds * 1000));
  const part = (value, size) => String(value).padStart(size, "0");
  return `${part(Math.floor(total / 3600000), 2)}:${part(Math.floor(total / 60000) % 60, 2)}:${part(Math.floor(total / 1000) % 60, 2)},${part(total % 1000, 3)}`;
};
const subtitles = (chunks) => chunks.map((chunk, index) => `${index + 1}\n${stamp(chunk.timestamp[0])} --> ${stamp(chunk.timestamp[1] ?? chunk.timestamp[0] + 2)}\n${chunk.text.trim()}\n`).join("\n");

async function transcribe(blob, name) {
  if (state.busy) return;
  state.busy = true;
  setBusy(true);
  const started = performance.now();
  try {
    work(tr("status.decoding"));
    let audio;
    try { audio = await decode(blob); } catch (error) { console.error(error); throw new Error(tr("error.decode")); }
    els.listenSource.textContent = tr(name ? "listen.source" : "listen.recorded", { name, duration: formatTime(audio.seconds) });
    const transcriber = await loadTranscriber();
    work(tr("status.listening"));
    const language = state.listen === AUTO ? null : languageOf(state.listen).whisper;
    const result = await transcriber(audio.samples, {
      return_timestamps: true, chunk_length_s: engine.chunkSeconds, stride_length_s: engine.strideSeconds,
      ...(language ? { language, task: "transcribe" } : {}),
    });
    const chunks = (result.chunks || []).filter((chunk) => chunk.text.trim());
    const text = (result.text || "").trim();
    if (!text) { showTranscript(null); return fail(tr("error.noSpeech")); }
    showTranscript({ text, chunks, name: name || "recording" });
    rest();
    done(tr("status.listened", { seconds: i18n.number((performance.now() - started) / 1000, { maximumFractionDigits: 1 }), length: formatTime(audio.seconds) }));
  } catch (error) {
    console.error(error);
    fail(tr("error.failed", { message: error.message || error }));
  } finally {
    rest();
    state.busy = false;
    setBusy(false);
  }
}

function showTranscript(transcript) {
  state.transcript = transcript;
  els.listenText.textContent = transcript ? transcript.text : "";
  els.listenCount.textContent = transcript ? tr("count", { count: i18n.number(transcript.text.length) }) : "";
  for (const button of [els.copyListen, els.saveText, els.saveSubtitles]) button.disabled = !transcript;
  els.saveSubtitles.disabled = !transcript?.chunks.length;
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  popups.toast(tr("toast.saved", { name: filename }));
}
const baseName = (name) => name.replace(/\.[^.]+$/, "") || "speech";

els.chooseButton.addEventListener("click", () => { if (!state.busy && !state.recording) els.fileInput.click(); });
els.fileInput.addEventListener("change", () => {
  const file = els.fileInput.files[0];
  els.fileInput.value = "";
  if (file) transcribe(file, file.name);
});
els.copyListen.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(state.transcript.text); popups.toast(tr("toast.copied")); } catch (error) { fail(tr("error.failed", { message: error.message })); }
});
els.saveText.addEventListener("click", () => download(`${baseName(state.transcript.name)}.txt`, state.transcript.text, "text/plain;charset=utf-8"));
els.saveSubtitles.addEventListener("click", () => download(`${baseName(state.transcript.name)}.srt`, subtitles(state.transcript.chunks), "text/plain;charset=utf-8"));

async function startRecording() {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (error) { return fail(tr("error.microphone", { message: error.message || error })); }
  const recorder = new MediaRecorder(stream);
  const recording = { recorder, stream, chunks: [], started: performance.now(), timer: null };
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size) recording.chunks.push(event.data); });
  recorder.addEventListener("stop", () => {
    clearInterval(recording.timer);
    for (const track of stream.getTracks()) track.stop();
    state.recording = null;
    renderRecord();
    if (recording.chunks.length) transcribe(new Blob(recording.chunks, { type: recorder.mimeType }), "");
  });
  state.recording = recording;
  recording.timer = setInterval(renderRecord, 500);
  recorder.start();
  renderRecord();
}
function renderRecord() {
  const recording = state.recording;
  els.recordButton.classList.toggle("recording", !!recording);
  els.recordLabel.textContent = recording ? tr("listen.recording", { time: formatTime((performance.now() - recording.started) / 1000) }) : tr("listen.record");
}
els.recordButton.addEventListener("click", () => {
  if (state.recording) state.recording.recorder.stop();
  else if (!state.busy) startRecording();
});

const MODEL = "model";
const mmsRepo = (language) => speech.modelTemplate.replace("{code}", language.mms);

function readVoices() {
  state.voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  buildVoices();
}
const voicesOf = (language) => state.voices.filter((voice) => voice.lang.toLowerCase().startsWith(language.code));

function buildVoices() {
  const language = languageOf(state.speak);
  const options = [];
  if (language.mms) options.push({ value: MODEL, label: tr("speak.model", { name: speech.name }) });
  for (const voice of voicesOf(language)) options.push({ value: `system:${voice.name}`, label: tr("speak.system", { name: voice.name }) });
  if (!options.length) options.push({ value: "", label: tr("speak.noVoice") });
  els.voiceSelect.replaceChildren(...options.map(({ value, label }) => Object.assign(document.createElement("option"), { value, textContent: label })));
  state.voice = options.some((option) => option.value === state.voice) ? state.voice : options[0].value;
  els.voiceSelect.value = state.voice;
  els.speakText.dir = language.dir;
}

function wav(samples, rate) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const write = (offset, text) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
  return view.buffer;
}

async function speak() {
  if (state.busy) return;
  const text = els.speakText.value.trim();
  if (!text) return fail(tr("error.empty"));
  if (!state.voice) return fail(tr("speak.noVoice"));
  state.busy = true;
  setBusy(true);
  state.audio = null;
  els.saveAudio.disabled = true;
  const started = performance.now();
  try {
    if (state.voice === MODEL) await speakWithModel(text, started);
    else await speakWithDevice(text);
    rest();
    if (!state.stopped) done(tr("status.spoken", { seconds: i18n.number((performance.now() - started) / 1000, { maximumFractionDigits: 1 }) }));
  } catch (error) {
    console.error(error);
    fail(tr("error.failed", { message: error.message || error }));
  } finally {
    rest();
    state.busy = false;
    state.stopped = false;
    state.output = null;
    setBusy(false);
  }
}

async function speakWithModel(text, started) {
  const language = languageOf(state.speak);
  const repo = mmsRepo(language);
  if (!state.speakers.has(repo)) state.speakers.set(repo, await load("text-to-speech", repo, { dtype: speech.dtype }));
  if (state.stopped) return;
  work(tr("status.generating"));
  const result = await state.speakers.get(repo)(text);
  if (state.stopped) return;
  state.audio = { samples: result.audio, rate: result.sampling_rate };
  els.saveAudio.disabled = false;
  work(tr("status.speaking"));
  const context = new AudioContext();
  const buffer = context.createBuffer(1, result.audio.length, result.sampling_rate);
  buffer.copyToChannel(result.audio, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  await new Promise((resolve) => {
    state.output = { stop: () => { source.onended = null; source.stop(); resolve(); } };
    source.onended = resolve;
    source.start();
  });
  context.close();
}

function speakWithDevice(text) {
  const language = languageOf(state.speak);
  const voice = state.voices.find((item) => `system:${item.name}` === state.voice);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice?.lang || language.locale;
  if (voice) utterance.voice = voice;
  work(tr("status.speaking"));
  return new Promise((resolve, reject) => {
    utterance.onend = resolve;
    utterance.onerror = (event) => (event.error === "canceled" || event.error === "interrupted" ? resolve() : reject(new Error(event.error)));
    state.output = { stop: () => speechSynthesis.cancel() };
    speechSynthesis.speak(utterance);
  });
}

function setBusy(busy) {
  els.speakButton.classList.toggle("hidden", busy);
  els.stopButton.classList.toggle("hidden", !busy || state.view !== "speak");
  els.chooseButton.disabled = busy;
  els.recordButton.disabled = busy && !state.recording;
}
els.speakButton.addEventListener("click", speak);
els.stopButton.addEventListener("click", () => { state.stopped = true; state.output?.stop(); });
els.speakText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); speak(); }
});
els.speakText.addEventListener("input", () => { renderCount(); urlState.set({ text: els.speakText.value.length <= TEXT_LIMIT ? els.speakText.value : "" }); });
function renderCount() {
  els.speakCount.textContent = tr("count", { count: i18n.number(els.speakText.value.length) });
}
els.clearButton.addEventListener("click", () => {
  if (state.busy) return;
  els.speakText.value = "";
  renderCount();
  idle();
  els.speakText.focus();
});
els.saveAudio.addEventListener("click", () => { if (state.audio) download("speech.wav", wav(state.audio.samples, state.audio.rate), "audio/wav"); });

const savePreferences = () => {
  settings.set("speechmu", { ...settings.get("speechmu", defaults), model: state.model.id, listen: state.listen, speak: state.speak });
  urlState.set({ model: state.model.id, listen: state.listen, speak: state.speak });
};
settings.onChange("speechmu", defaults, (changed) => {
  if (state.busy) return;
  state.model = models.find((model) => model.id === changed.model) || state.model;
  state.listen = changed.listen === AUTO || languageOf(changed.listen) ? changed.listen : state.listen;
  state.speak = known(changed.speak, state.speak);
  buildChoices();
});
settings.listen("speechmu", (message) => { if (message.type === "modelDeleted") { state.transcribers.clear(); state.speakers.clear(); } });

function buildChoices() {
  const option = (value, textContent) => Object.assign(document.createElement("option"), { value, textContent });
  els.modelSelect.replaceChildren(...models.map((model) => option(model.id, `${model.name} — ${i18n.pick(model.hint)}`)));
  els.modelSelect.value = state.model.id;
  els.listenLanguage.replaceChildren(option(AUTO, tr("listen.auto")), ...languages.map((language) => option(language.code, language.name)));
  els.listenLanguage.value = state.listen;
  els.speakLanguage.replaceChildren(...languages.map((language) => option(language.code, language.name)));
  els.speakLanguage.value = state.speak;
  buildVoices();
}
els.modelSelect.addEventListener("change", () => {
  if (state.busy) { els.modelSelect.value = state.model.id; return; }
  state.model = models.find((model) => model.id === els.modelSelect.value);
  savePreferences();
});
els.listenLanguage.addEventListener("change", () => { state.listen = els.listenLanguage.value; savePreferences(); });
els.speakLanguage.addEventListener("change", () => { state.speak = els.speakLanguage.value; savePreferences(); buildVoices(); });
els.voiceSelect.addEventListener("change", () => { state.voice = els.voiceSelect.value; });

account.bind(els.accountButton);

function renderTexts() {
  renderTabs();
  buildChoices();
  renderRecord();
  renderCount();
  els.listenText.dataset.placeholder = tr("listen.placeholder");
  idle();
}
i18n.onChange(renderTexts);
if (window.speechSynthesis) speechSynthesis.addEventListener("voiceschanged", readVoices);

els.speakText.value = urlState.get("text");
showView();
renderTexts();
readVoices();
