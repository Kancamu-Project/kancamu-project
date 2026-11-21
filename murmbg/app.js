// muRMBG: removes the background of an image or a video with a model that runs on the graphics card (WebGPU). The image never leaves the device.
import { AutoModel, AutoProcessor, RawImage, pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

env.allowLocalModels = false;   // the model is downloaded from Hugging Face once and kept in the browser cache

await i18n.load();
i18n.selects();

const { extensionOf, formatSize } = components;
const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "model-select", "frame-rate-select", "format-select", "colour-input", "stop-button", "zip-button", "download-label", "drop-zone", "choose-button", "drive-button", "file-input", "result-area", "background-switch", "another-button", "save-button", "download-button",
  "original-picture", "result-picture", "progress", "progress-fill", "status",
  "account-button", 
  "drive-dialog", "drive-close-button", "drive-search", "drive-list", "drive-message"
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

// The models, the backgrounds, the Drive branch and folder, and the image types are in data.json.
const { models, backgrounds, downloadSuffix, storageBranch, saveFolder, media, mimeTypes, video, settings: { defaults } } = i18n.data;
const preferences = settings.get("murmbg", defaults);   // the model, the frames per second, the format, and the background: set here and in the account web
const MEDIA_TYPES = new Set([...media.image, ...media.video]);   // what the Drive list shows

const state = {
  model: models.find((model) => model.id === preferences.model) || models[0],   // the model that is chosen
  broken: false,     // the graphics card failed on a model: until the page is reloaded, every model fails
  engines: new Map(),// the models that are loaded: id -> engine
  file: null,        // the image or video that is being worked on, to do it again with another model
  kind: "image",     // "image" or "video"
  fps: Number(preferences.fps),   // frames per second that are cut from a video
  frames: [],        // the frames of a video, with a transparent background (ImageBitmap)
  sound: undefined,  // the sound of the video once it is decoded (an AudioBuffer), null when it has none
  playId: 0,         // changes to stop the playing of the frames
  stop: false,       // the user stopped the cutting of a video
  busy: false,
  store: null,       // the drivemu branch, opened when the Drive is first needed
  token: "",         // the token the store was opened with
  name: "",          // the name of the image, without its extension
  original: "",      // the address of the original picture
  cutout: null,      // the canvas of the result, with a transparent background
  cutoutUrl: "",
  background: backgrounds.includes(preferences.background) ? preferences.background : backgrounds[0],
  customColour: preferences.customColour,   // the colour of the background that the user picks
  format: preferences.format,   // the file format of a video
};

const say = components.status(els.status);
function setProgress(percent) {
  els.progress.classList.toggle("hidden", percent === null);
  if (percent !== null) els.progressFill.style.width = `${percent}%`;
}

/* ---------- the models ---------- */
// Loads the chosen model (once). A card that can do 16-bit numbers gets the smaller file when the model has one.
async function loadEngine(model) {
  if (state.engines.has(model.id)) return state.engines.get(model.id);
  const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
  if (!adapter) throw Object.assign(new Error("no WebGPU"), { code: "noGpu" });
  const dtype = model.dtypeWithFloat16 && adapter.features.has("shader-f16") ? model.dtypeWithFloat16 : model.dtype;
  const files = new Map();
  const progress_callback = (info) => {
    if (info.status === "progress" && info.file) {
      files.set(info.file, { loaded: info.loaded, total: info.total });
      let loaded = 0, total = 0;
      for (const file of files.values()) { loaded += file.loaded; total += file.total; }
      const percent = total ? Math.round((loaded / total) * 100) : 0;
      setProgress(percent);
      say(tr("status.loadingModel", { percent }));
    } else if (info.status === "ready") say(tr("status.preparingModel"));
  };
  let engine;
  if (model.loader === "pipeline") {
    engine = { segmenter: await pipeline("background-removal", model.id, { device: "webgpu", dtype, progress_callback }) };
  } else {
    const [processor, net] = await Promise.all([
      AutoProcessor.from_pretrained(model.id, { progress_callback }),
      AutoModel.from_pretrained(model.id, { config: { model_type: "custom" }, device: "webgpu", dtype, progress_callback }),
    ]);
    engine = { processor, net };
  }
  state.engines.set(model.id, engine);
  return engine;
}

// Puts the opacity of the model on the pixels of the canvas: after this the background is transparent.
async function cutOut(model, engine, canvas, context) {
  const picture = RawImage.fromCanvas(canvas);
  if (model.loader === "pipeline") {
    const result = await engine.segmenter(picture);
    const cut = Array.isArray(result) ? result[0] : result;   // the picture with its background removed (RGBA)
    context.putImageData(new ImageData(new Uint8ClampedArray(cut.data), cut.width, cut.height), 0, 0);
    return;
  }
  const { pixel_values } = await engine.processor(picture);
  const { output } = await engine.net({ input: pixel_values });
  const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < mask.data.length; i++) pixels.data[i * 4 + 3] = mask.data[i];   // the mask is the opacity of every pixel
  context.putImageData(pixels, 0, 0);
}

/* ---------- one image or video ---------- */
const hasResult = () => (state.kind === "video" ? state.frames.length > 0 : !!state.cutout);
function setReady(ready) {
  for (const button of [els.downloadButton, els.saveButton, els.zipButton]) button.disabled = !ready;
}
// The buttons that depend on the kind of file.
function renderMode() {
  const isVideo = state.kind === "video" && !els.resultArea.classList.contains("hidden");
  els.downloadLabel.textContent = tr(isVideo ? "download.video" : "download");
  els.zipButton.classList.toggle("hidden", !isVideo);
  els.formatSelect.classList.toggle("hidden", !isVideo);
}

async function handleFile(file) {
  if (state.busy || !file) return;
  if (state.broken) return say(tr("error.reload"), true);
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "";
  if (!kind) return say(tr("error.notImage"), true);
  state.busy = true;
  clearPictures();
  Object.assign(state, { file, kind, name: file.name.replace(/\.[^.]+$/, "") || kind, original: URL.createObjectURL(file) });
  els.originalPicture.setAttribute("aria-label", file.name);
  if (kind === "image") els.originalPicture.style.setProperty("--picture", `url("${state.original}")`);
  else els.originalPicture.replaceChildren(Object.assign(document.createElement("video"), { src: state.original, controls: true, muted: true, loop: true, playsInline: true }));
  els.dropZone.classList.add("hidden");
  els.resultArea.classList.remove("hidden");
  setReady(false);
  renderMode();
  const started = performance.now();
  try {
    if (kind === "image") await processImage(file, started); else await processVideo(started);
  } catch (error) {
    console.error(error);
    // A model that the graphics card cannot run leaves it in a state where every other model fails too (ShaderModule errors), until the page is loaded again.
    state.broken = /OrtRun|ShaderModule|storage buffers|WebGPU|GPU/i.test(String(error.message)) && error.code !== "noGpu";
    say(error.code === "noGpu" ? tr("error.noGpu") : state.broken ? tr("error.gpu", { message: String(error.message).replace(/\s+/g, " ").slice(-80) }) : tr("error.failed", { message: error.message || error }), true);
  } finally {
    setProgress(null);
    els.stopButton.classList.add("hidden");
    state.busy = false;
  }
}

async function processImage(file, started) {
  const bitmap = await readBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  say(tr("status.processing"));
  const model = state.model;
  const engine = await loadEngine(model);
  setProgress(null);
  say(tr("status.processing"));
  await cutOut(model, engine, canvas, context);

  state.cutout = canvas;
  state.cutoutUrl = URL.createObjectURL(await toBlob(canvas));
  els.resultPicture.style.setProperty("--picture", `url("${state.cutoutUrl}")`);
  els.resultPicture.setAttribute("aria-label", tr("result"));
  setReady(true);
  say(tr("status.done", { seconds: seconds(started), width: canvas.width, height: canvas.height }));
}

const seconds = (started) => i18n.number((performance.now() - started) / 1000, { maximumFractionDigits: 1 });

// Waits for an event of an element, and fails on its error event.
const waitFor = (target, name) => new Promise((resolve, reject) => {
  const done = () => { target.removeEventListener(name, ok); target.removeEventListener("error", bad); };
  const ok = () => { done(); resolve(); };
  const bad = () => { done(); reject(new Error(tr("error.noVideo"))); };
  target.addEventListener(name, ok);
  target.addEventListener("error", bad);
});
function seek(player, time) {
  if (player.readyState >= 2 && Math.abs(player.currentTime - time) < 0.0005) return Promise.resolve();
  const arrived = waitFor(player, "seeked");
  player.currentTime = time;
  return arrived;
}

// A video: every frame is read at the chosen frames per second, cut out, and kept; then the frames play in the result.
async function processVideo(started) {
  const reader = Object.assign(document.createElement("video"), { muted: true, preload: "auto", playsInline: true });
  reader.src = state.original;
  await waitFor(reader, "loadeddata");
  if (!Number.isFinite(reader.duration)) {   // a file made by a recorder has no length in it: going far makes the browser find it
    const found = waitFor(reader, "durationchange");
    reader.currentTime = 1e101;
    await found;
  }
  const { videoWidth: width, videoHeight: height, duration } = reader;
  if (!width || !height || !duration) throw new Error(tr("error.noVideo"));
  const fps = state.fps;
  const total = Math.max(1, Math.floor(duration * fps));

  const model = state.model;
  const engine = await loadEngine(model);
  setProgress(null);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const view = Object.assign(document.createElement("canvas"), { width, height });
  els.resultPicture.replaceChildren(view);
  els.resultPicture.setAttribute("aria-label", tr("result"));
  els.stopButton.classList.remove("hidden");
  state.stop = false;
  for (let i = 0; i < total && !state.stop; i++) {
    await seek(reader, Math.max(0, Math.min(i / fps, duration - 0.001)));
    context.clearRect(0, 0, width, height);
    context.drawImage(reader, 0, 0, width, height);
    await cutOut(model, engine, canvas, context);
    const frame = await createImageBitmap(canvas);
    state.frames.push(frame);
    showFrame(view, frame);
    setProgress(Math.round(((i + 1) / total) * 100));
    say(tr("status.frame", { done: i + 1, total }));
  }
  reader.removeAttribute("src"); reader.load();
  setProgress(null);
  if (!state.frames.length) return say(tr("status.idle"));
  state.framesPerSecond = fps;
  play(view);
  setReady(true);
  say(tr("status.doneVideo", { seconds: seconds(started), frames: state.frames.length, width, height }));
}
function showFrame(view, frame) {
  const context = view.getContext("2d");
  context.clearRect(0, 0, view.width, view.height);
  context.drawImage(frame, 0, 0);
}
// Plays the frames over and over, at the speed they were cut.
function play(view) {
  const id = ++state.playId;
  const begin = performance.now();
  let shown = -1;
  const tick = () => {
    if (id !== state.playId) return;
    const index = Math.floor(((performance.now() - begin) / 1000) * state.framesPerSecond) % state.frames.length;
    if (index !== shown) { shown = index; showFrame(view, state.frames[index]); }
    requestAnimationFrame(tick);
  };
  tick();
}

// The picture as the browser draws it (turned the right way up), in the size it has.
const readBitmap = (file) => createImageBitmap(file);
const toBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG"))), "image/png"));

function clearPictures() {
  state.playId++;
  for (const frame of state.frames) frame.close();
  for (const url of [state.original, state.cutoutUrl]) if (url) URL.revokeObjectURL(url);
  Object.assign(state, { original: "", cutout: null, cutoutUrl: "", frames: [], sound: undefined });
  els.originalPicture.style.removeProperty("--picture");
  els.resultPicture.style.removeProperty("--picture");
  els.originalPicture.replaceChildren();
  els.resultPicture.replaceChildren();
}
function startOver() {
  if (state.busy) return;
  if (state.broken) { location.reload(); return; }   // a fresh start for the graphics card
  clearPictures();
  els.fileInput.value = "";
  state.file = null;
  els.resultArea.classList.add("hidden");
  els.dropZone.classList.remove("hidden");
  renderMode();
  say(tr("status.idle"));
}
els.stopButton.addEventListener("click", () => { state.stop = true; });

/* ---------- the settings: the page and the account web both set them, and each follows the other ---------- */
const savePreferences = () => settings.set("murmbg", { model: state.model.id, fps: state.fps, format: state.format, background: state.background, customColour: state.customColour });
settings.onChange("murmbg", defaults, (changed) => {
  const redo = changed.model !== state.model.id || (Number(changed.fps) !== state.fps && state.kind === "video");
  state.model = models.find((model) => model.id === changed.model) || state.model;
  state.fps = Number(changed.fps);
  state.format = changed.format;
  state.customColour = changed.customColour;
  applyColour(); chooseBackground(changed.background);
  buildModels(); buildFps(); buildFormats();
  if (redo && state.file && !state.busy) handleFile(state.file);   // what is on the screen is done again with the new setting
});

// The account web deleted the files of a model: what is loaded is let go, and it downloads again when it is used.
settings.listen("murmbg", (message) => { if (message.type === "modelDeleted") state.engines.clear(); });

/* ---------- the model that is chosen ---------- */
function buildModels() {
  els.modelSelect.replaceChildren(...models.map((model) => Object.assign(document.createElement("option"), { value: model.id, textContent: `${model.name} — ${i18n.pick(model.hint)}` })));
  els.modelSelect.value = state.model.id;
}
els.modelSelect.addEventListener("change", () => {
  state.model = models.find((model) => model.id === els.modelSelect.value);
  savePreferences();
  if (state.broken && !state.busy) { location.reload(); return; }   // after a failure, the other model needs a fresh page (the choice is saved, so the new page uses it)
  if (state.file && !state.busy) handleFile(state.file);   // the image on the screen is done again with the new model
  else if (state.busy) els.modelSelect.value = state.model.id;
});

/* ---------- the frames per second of a video ---------- */
function buildFps() {
  els.frameRateSelect.replaceChildren(...video.fpsOptions.map((value) => Object.assign(document.createElement("option"), { value, textContent: i18n.number(value) })));
  els.frameRateSelect.value = state.fps;
}
els.frameRateSelect.addEventListener("change", () => {
  if (state.busy) { els.frameRateSelect.value = state.fps; return; }
  state.fps = Number(els.frameRateSelect.value);
  savePreferences();
  if (state.file && state.kind === "video") handleFile(state.file);   // the video on the screen is done again
});

/* ---------- the background of the result ---------- */
function buildBackgrounds() {
  els.backgroundSwitch.replaceChildren(...backgrounds.map((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.background = name;
    button.innerHTML = "<span></span>";
    button.firstChild.textContent = tr(`background.${name}`);
    if (name === "custom") button.prepend(Object.assign(document.createElement("span"), { className: "swatch" }));
    button.addEventListener("click", () => {
      chooseBackground(name);
      savePreferences();
      if (name === "custom") try { els.colourInput.showPicker(); } catch { els.colourInput.click(); }   // the colour is chosen in the picker of the browser
    });
    return button;
  }));
  chooseBackground(state.background);
}
function chooseBackground(name) {
  state.background = name;
  for (const button of els.backgroundSwitch.children) button.classList.toggle("active", button.dataset.background === name);
  for (const other of backgrounds) els.resultPicture.classList.toggle(`background-${other}`, other === name);
}
// The colour of a background that is not transparent comes from the colours of the page (--white, --black).
const colourOf = (name) => (name === "custom" ? state.customColour : getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim());
function applyColour() {
  document.documentElement.style.setProperty("--custom-colour", state.customColour);
  els.colourInput.value = state.customColour;
}
els.colourInput.addEventListener("input", () => { state.customColour = els.colourInput.value; applyColour(); chooseBackground("custom"); savePreferences(); });
applyColour();

// A picture or a frame on the background that is chosen.
function paint(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (state.background !== "transparent") { context.fillStyle = colourOf(state.background); context.fillRect(0, 0, width, height); }
  context.drawImage(source, 0, 0);
  return canvas;
}
const resultBlob = () => toBlob(paint(state.cutout, state.cutout.width, state.cutout.height));

// The format of the video that is chosen (a format the browser cannot record is not offered).
const formatOf = () => video.formats.find((format) => format.id === state.format) || video.formats[0];
const recorderType = (format) => format.recorderTypes?.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type));
const offered = () => video.formats.filter((format) => format.recorderTypes ? recorderType(format) : true);
function buildFormats() {
  els.formatSelect.replaceChildren(...offered().map((format) => Object.assign(document.createElement("option"), { value: format.id, textContent: format.alpha ? format.name : `${format.name} — ${tr("format.noAlpha")}` })));
  if (!offered().some((format) => format.id === state.format)) state.format = offered()[0].id;
  els.formatSelect.value = state.format;
}
els.formatSelect.addEventListener("change", () => {
  state.format = els.formatSelect.value;
  savePreferences();
});

// A video as a file of the chosen format.
const videoBlob = (format) => (format.recorderTypes ? recordedVideo(format) : gifVideo());

// The sound of the video, decoded once. A video without sound, or with a sound the browser cannot decode, gives null.
async function soundOf(audioContext) {
  if (state.sound === undefined) {
    try { state.sound = await audioContext.decodeAudioData(await state.file.arrayBuffer()); } catch { state.sound = null; }
  }
  return state.sound;
}

// WebM or MP4: the frames are drawn one after the other at their speed while the browser records the canvas.
async function recordedVideo(format) {
  const { width, height } = state.frames[0];
  const fps = state.framesPerSecond;
  const target = Object.assign(document.createElement("canvas"), { width, height });
  const context = target.getContext("2d");
  const mimeType = recorderType(format);
  if (!mimeType) throw new Error(tr("error.noRecorder"));
  const stream = target.captureStream(0);
  const audioContext = new AudioContext();   // the sound of the video goes into the recording through this
  const sound = await soundOf(audioContext);
  const destination = audioContext.createMediaStreamDestination();
  if (sound) stream.addTrack(destination.stream.getAudioTracks()[0]);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: Math.round(width * height * fps * video.bitsPerPixel) });
  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
  const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve));
  recorder.start();
  await new Promise((resolve) => setTimeout(resolve, 100));   // the recorder needs a moment, or it loses the first frame
  await audioContext.resume();
  if (sound) {   // the sound starts with the first frame and ends with the last one
    const source = audioContext.createBufferSource();
    source.buffer = sound;
    source.connect(destination);
    source.start(0, 0, state.frames.length / fps);
  }
  const begin = performance.now();
  for (let i = 0; i < state.frames.length; i++) {
    const wait = begin + (i * 1000) / fps - performance.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    context.clearRect(0, 0, width, height);
    if (state.background !== "transparent") { context.fillStyle = colourOf(state.background); context.fillRect(0, 0, width, height); }
    context.drawImage(state.frames[i], 0, 0);
    stream.getVideoTracks()[0].requestFrame();
    setProgress(Math.round(((i + 1) / state.frames.length) * 100));
    say(tr("status.encoding", { done: i + 1, total: state.frames.length }));
  }
  await new Promise((resolve) => setTimeout(resolve, 1000 / fps));   // the last frame stays for its time
  recorder.stop();
  await stopped;
  audioContext.close();
  return new Blob(chunks, { type: mimeType.split(";")[0] });
}

// GIF: 256 fixed colours (the last one is the transparent one) and the LZW compression of the format.
function lzw(indices) {
  const out = [];
  let bits = 0, count = 0, size = 9, next = 258;
  const emit = (code) => { bits |= code << count; count += size; while (count >= 8) { out.push(bits & 255); bits >>>= 8; count -= 8; } };
  let dictionary = new Map();
  emit(256);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const key = (prefix << 8) | indices[i];
    const found = dictionary.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next === 4096) { emit(256); dictionary = new Map(); size = 9; next = 258; }
    else { if (next >= 1 << size) size++; dictionary.set(key, next++); }
    prefix = indices[i];
  }
  emit(prefix);
  emit(257);
  if (count > 0) out.push(bits & 255);
  return out;
}
async function gifVideo() {
  const { levels, alphaThreshold } = video.gif;
  const { width, height } = state.frames[0];
  const transparent = levels.red * levels.green * levels.blue;   // the index of the transparent colour
  const bytes = [];
  const word = (value) => bytes.push(value & 255, value >> 8);
  bytes.push(...[..."GIF89a"].map((letter) => letter.charCodeAt(0)));
  word(width); word(height); bytes.push(0xf7, 0, 0);
  for (let i = 0; i < 256; i++) {   // the palette
    const red = Math.floor(i / (levels.green * levels.blue)), green = Math.floor(i / levels.blue) % levels.green, blue = i % levels.blue;
    bytes.push(i < transparent ? Math.round((red * 255) / (levels.red - 1)) : 0, i < transparent ? Math.round((green * 255) / (levels.green - 1)) : 0, i < transparent ? Math.round((blue * 255) / (levels.blue - 1)) : 0);
  }
  bytes.push(0x21, 0xff, 11, ...[..."NETSCAPE2.0"].map((letter) => letter.charCodeAt(0)), 3, 1, 0, 0, 0);   // loops forever
  const delay = Math.round(100 / state.framesPerSecond);
  for (let f = 0; f < state.frames.length; f++) {
    const pixels = paint(state.frames[f], width, height).getContext("2d").getImageData(0, 0, width, height).data;
    const indices = new Uint8Array(width * height);
    for (let p = 0; p < indices.length; p++) {
      const o = p * 4;
      indices[p] = pixels[o + 3] < alphaThreshold ? transparent
        : Math.round((pixels[o] * (levels.red - 1)) / 255) * levels.green * levels.blue + Math.round((pixels[o + 1] * (levels.green - 1)) / 255) * levels.blue + Math.round((pixels[o + 2] * (levels.blue - 1)) / 255);
    }
    bytes.push(0x21, 0xf9, 4, 0x09, delay & 255, delay >> 8, transparent, 0);   // 0x09: the previous frame is cleared, a colour is transparent
    bytes.push(0x2c); word(0); word(0); word(width); word(height); bytes.push(0, 8);
    const data = lzw(indices);
    for (let i = 0; i < data.length; i += 255) { const block = data.slice(i, i + 255); bytes.push(block.length, ...block); }
    bytes.push(0);
    setProgress(Math.round(((f + 1) / state.frames.length) * 100));
    say(tr("status.encodingGif", { done: f + 1, total: state.frames.length }));
    await new Promise((resolve) => setTimeout(resolve));   // the page stays alive
  }
  bytes.push(0x3b);
  return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
}

// The frames as PNG files in one ZIP (stored, not compressed: PNG is already compressed).
const CRC_TABLE = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makeZip(files) {   // [{ name, bytes }]
  const encoder = new TextEncoder();
  const parts = [], central = [];
  let offset = 0, centralSize = 0;
  for (const { name, bytes } of files) {
    const nameBytes = encoder.encode(name), crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(12, 0x21, true); local.setUint32(14, crc, true); local.setUint32(18, bytes.length, true); local.setUint32(22, bytes.length, true); local.setUint16(26, nameBytes.length, true);
    parts.push(local, nameBytes, bytes);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true);
    entry.setUint16(14, 0x21, true); entry.setUint32(16, crc, true); entry.setUint32(20, bytes.length, true); entry.setUint32(24, bytes.length, true); entry.setUint16(28, nameBytes.length, true); entry.setUint32(42, offset, true);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + bytes.length;
    centralSize += 46 + nameBytes.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
async function framesZip() {
  const files = [];
  for (let i = 0; i < state.frames.length; i++) {
    const frame = state.frames[i];
    const bytes = new Uint8Array(await (await toBlob(paint(frame, frame.width, frame.height))).arrayBuffer());
    files.push({ name: `${state.name}-${String(i + 1).padStart(video.frameDigits, "0")}.png`, bytes });
    setProgress(Math.round(((i + 1) / state.frames.length) * 100));
    say(tr("status.encoding", { done: i + 1, total: state.frames.length }));
  }
  return makeZip(files);
}

// Makes a file while the page is busy, then puts the status back as it was.
async function making(job) {
  const before = els.status.textContent;
  state.busy = true;
  try { return await job(); } finally { state.busy = false; setProgress(null); say(before); }
}
// The result as a file: a PNG for an image, a WebM for a video.
const resultFile = () => (state.kind === "video"
  ? making(async () => ({ blob: await videoBlob(formatOf()), extension: formatOf().extension }))
  : resultBlob().then((blob) => ({ blob, extension: "png" })));

function save(blob, name) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
els.downloadButton.addEventListener("click", async () => {
  if (!hasResult() || state.busy) return;
  try {
    const { blob, extension } = await resultFile();
    save(blob, `${state.name}${downloadSuffix}.${extension}`);
  } catch (error) { say(tr("error.failed", { message: error.message }), true); }
});
els.zipButton.addEventListener("click", async () => {
  if (!hasResult() || state.busy) return;
  try { save(await making(framesZip), `${state.name}${downloadSuffix}.zip`); } catch (error) { say(tr("error.failed", { message: error.message }), true); }
});

/* ---------- the Drive: choosing an image from it, and saving the result to it ---------- */
// The Drive needs the account. Without one, the account dialog opens and the user tries again once signed in.
async function openDrive() {
  const signedIn = account.get();
  if (!signedIn) { account.open(); return null; }
  if (!state.store || state.token !== signedIn.token) { state.store = await storage.connect(storageBranch); state.token = signedIn.token; }
  return state.store;
}
let driveImages = [];   // { path, name, folder, size }

async function chooseFromDrive() {
  if (state.busy) return;
  els.driveMessage.textContent = tr("drive.loading");
  els.driveMessage.classList.remove("hidden");
  let store;
  try { store = await openDrive(); } catch (error) { return say(tr("drive.failed", { message: error.message }), true); }
  if (!store) return;   // the account dialog is open
  els.driveList.replaceChildren();
  els.driveSearch.value = "";
  els.driveDialog.showModal();
  els.driveSearch.focus();
  try {
    const { files } = await storage.tree(store);
    driveImages = files.filter((file) => MEDIA_TYPES.has(extensionOf(file.path))).map((file) => {
      const parts = file.path.split("/");
      const name = parts.pop();
      return { path: file.path, name, folder: parts.join("/"), size: file.size };
    }).sort((a, b) => a.path.localeCompare(b.path, i18n.lang, { numeric: true }));
    renderDriveList();
  } catch (error) {
    els.driveMessage.textContent = tr("drive.failed", { message: error.message });
  }
}
function renderDriveList() {
  const query = els.driveSearch.value.trim().toLowerCase();
  const shown = driveImages.filter((image) => !query || image.name.toLowerCase().includes(query));
  els.driveList.replaceChildren(...shown.map((image) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "drive-file";
    row.title = image.path;
    const icon = document.createElement("span"); icon.className = "icon icon-image";
    const name = document.createElement("span"); name.textContent = image.name;
    const folder = document.createElement("span"); folder.className = "drive-file-folder"; folder.textContent = image.folder;
    const size = document.createElement("span"); size.className = "drive-file-size"; size.textContent = formatSize(image.size);
    row.append(icon, name, folder, size);
    row.addEventListener("click", () => openFromDrive(image));
    return row;
  }));
  els.driveMessage.textContent = driveImages.length ? tr("drive.noMatches") : tr("drive.empty");
  els.driveMessage.classList.toggle("hidden", !!shown.length);
}
async function openFromDrive(image) {
  els.driveDialog.close();
  say(tr("drive.opening", { name: image.name }));
  try {
    const bytes = await storage.readBinary(state.store, image.path);
    if (!bytes) throw new Error("not found");
    const file = new File([bytes], image.name, { type: mimeTypes[extensionOf(image.name)] || "image/png" });   // the type tells an image from a video
    if (!els.dropZone.classList.contains("hidden")) handleFile(file); else { startOver(); handleFile(file); }
  } catch (error) {
    say(tr("drive.failed", { message: error.message }), true);
  }
}
els.driveButton.addEventListener("click", chooseFromDrive);
els.driveSearch.addEventListener("input", renderDriveList);
els.driveCloseButton.addEventListener("click", () => els.driveDialog.close());
autocomplete.attach(els.driveSearch, { suggestions: () => driveImages.map((image) => image.name) });

// Saves the result to the Drive as a new file (the user can change the folder and the name), and asks before replacing one.
els.saveButton.addEventListener("click", async () => {
  if (!hasResult() || state.busy) return;
  const extension = state.kind === "video" ? formatOf().extension : "png";
  let store;
  try { store = await openDrive(); } catch (error) { return say(tr("save.failed", { message: error.message }), true); }
  if (!store) return;
  let suggestion = `${saveFolder}/${state.name}${downloadSuffix}`;
  try {   // a name that is free in the folder
    const taken = new Set((await storage.list(store, saveFolder)).map((file) => file.name));
    for (let n = 2; taken.has(`${suggestion.split("/").pop()}.${extension}`); n++) suggestion = `${saveFolder}/${state.name}${downloadSuffix}-${n}`;
  } catch { /* the name stays as it is */ }
  const answer = await popups.ask({ text: tr("save.prompt"), value: `${suggestion}.${extension}`, ok: tr("drive.save") });
  if (answer === null) return;
  const path = answer.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(new RegExp(`(\\.${extension})?$`, "i"), `.${extension}`);
  if (!path.replace(new RegExp(`\\.${extension}$`, "i"), "") || path.split("/").some((part) => !part || part === "." || part === ".." || part === ".git")) return say(tr("save.invalid"), true);
  say(tr("save.saving"));
  try {
    const folder = path.split("/").slice(0, -1).join("/");
    const exists = (await storage.list(store, folder)).some((file) => file.name === path.split("/").pop());
    if (exists && !(await popups.ask({ text: tr("save.exists", { path }), ok: tr("save.replace") }))) return say(tr("status.idle"));
    const { blob } = await resultFile();
    await storage.writeBinary(store, path, new Uint8Array(await blob.arrayBuffer()), `muRMBG: save ${path}`);
    say(tr("save.saved", { path }));
    popups.toast(tr("save.saved", { path }));
  } catch (error) {
    say(tr("save.failed", { message: error.message }), true);
  }
});

/* ---------- choosing, dropping, and pasting an image ---------- */
els.chooseButton.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => handleFile(els.fileInput.files[0]));
els.anotherButton.addEventListener("click", startOver);
document.addEventListener("dragover", (event) => { event.preventDefault(); els.dropZone.classList.add("over"); });
document.addEventListener("dragleave", (event) => { if (!event.relatedTarget) els.dropZone.classList.remove("over"); });
document.addEventListener("drop", async (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("over");
  const files = await transfer.take(event);   // the ones of the computer, or a file of the Drive
  const file = files.find((candidate) => /^(image|video)\//.test(candidate.type)) || files[0];
  if (file && !state.busy) { if (!els.dropZone.classList.contains("hidden")) handleFile(file); else { startOver(); handleFile(file); } }
});
document.addEventListener("paste", (event) => {
  const file = [...(event.clipboardData?.files || [])].find((candidate) => /^(image|video)\//.test(candidate.type));
  if (!file || state.busy) return;
  if (!els.dropZone.classList.contains("hidden")) handleFile(file); else { startOver(); handleFile(file); }
});

/* ---------- the settings ---------- */

account.bind(els.accountButton);
i18n.onChange(() => { buildBackgrounds(); buildModels(); buildFps(); buildFormats(); renderMode(); if (!state.busy && !hasResult()) say(tr("status.idle")); });

buildBackgrounds();
buildModels();
buildFps();
buildFormats();
renderMode();
say(tr("status.idle"));
