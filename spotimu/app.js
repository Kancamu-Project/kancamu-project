import { i18n, popups, account, settings, storage, urlState, autocomplete, components } from "../assets/js/shared.js";
import appData from "./data.js";

await i18n.load(appData);
i18n.selects();

const { extensionOf, formatSize } = components;
const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "music-search", "album-select", "sort-order", "refresh-button", "track-list", "empty-state", "empty-action-button",
  "player-name", "player-time", "seek-slider", "shuffle-button", "previous-button", "play-button", "play-icon", "next-button", "repeat-button", "repeat-mark", "volume-slider",
  "status", "audio-element", "account-button"
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));
const audio = els.audioElement;

const { media, limits, mimeTypes, settings: { defaults }, repeatModes } = i18n.data;
const AUDIO = new Set(media.audio);
const ALL = "", ROOT = "/";

const state = {
  token: "",
  store: null,
  phase: "signedOut",
  truncated: false,
  items: [],
  shown: [],
  queue: [],
  queueIndex: -1,
  history: [],
  now: null,
};

let playback = settings.get("spotimu", defaults);
const saveSettings = () => settings.set("spotimu", playback);
settings.onChange("spotimu", defaults, (changed) => { playback = changed; state.history = []; applySettings(); });
function applySettings() {
  audio.volume = playback.volume;
  els.volumeSlider.value = playback.volume;
  els.shuffleButton.setAttribute("aria-pressed", String(playback.shuffle));
  els.repeatButton.setAttribute("aria-pressed", String(playback.repeat !== "off"));
  els.repeatMark.textContent = playback.repeat === "one" ? "1" : "";
  const label = tr(`player.repeat.${playback.repeat}`);
  els.repeatButton.title = label;
  els.repeatButton.setAttribute("aria-label", label);
}

const clock = (seconds) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

async function loadFiles() {
  const signedIn = account.get();
  if (!signedIn) {
    Object.assign(state, { token: "", store: null, items: [], phase: "signedOut" });
    return render();
  }
  state.phase = "loading";
  render();
  try {
    if (!state.store || state.token !== signedIn.token) { state.store = await storage.drive(); state.token = signedIn.token; }
    const { files, truncated } = await storage.tree(state.store);
    state.truncated = truncated;
    state.items = files.filter((file) => AUDIO.has(extensionOf(file.path))).map((file) => {
      const parts = file.path.split("/");
      const name = parts.pop();
      return { path: file.path, name, title: name.slice(0, name.lastIndexOf(".")), album: parts.join("/"), size: file.size };
    });
    state.phase = "ready";
  } catch (error) {
    state.phase = "failed";
    state.items = [];
    if (error.status === 401) { popups.toast(tr("acct.tokenInvalid", { name: signedIn.login || tr("acct.anAccount") }), { kind: "error" }); account.signOut(); state.phase = "signedOut"; }
    else popups.toast(tr("load.failed", { message: error.message }), { kind: "error" });
  }
  render();
}

let wantedAlbum = urlState.get("album");
function renderAlbums() {
  const counts = new Map();
  for (const item of state.items) counts.set(item.album || ROOT, (counts.get(item.album || ROOT) || 0) + 1);
  const chosen = wantedAlbum ?? els.albumSelect.value;
  const option = (value, label) => Object.assign(document.createElement("option"), { value, textContent: label });
  els.albumSelect.replaceChildren(
    option(ALL, `${tr("album.all")} (${state.items.length})`),
    ...[...counts.keys()].sort((a, b) => a.localeCompare(b, i18n.lang, { numeric: true })).map((album) => option(album, `${album === ROOT ? tr("album.root") : album} (${counts.get(album)})`)),
  );
  els.albumSelect.value = counts.has(chosen) ? chosen : ALL;
  if (state.phase === "ready") wantedAlbum = null;
}
const inAlbum = (item) => els.albumSelect.value === ALL || (item.album || ROOT) === els.albumSelect.value;
const albumLabel = (item) => item.album || tr("album.root");

function render() {
  renderAlbums();
  const query = els.musicSearch.value.trim().toLowerCase();
  const [by, direction] = els.sortOrder.value.split("-");
  const compare = (a, b) => a.name.localeCompare(b.name, i18n.lang, { numeric: true });
  const inThisAlbum = state.items.filter(inAlbum);
  state.shown = inThisAlbum.filter((item) => !query || item.name.toLowerCase().includes(query));
  state.shown.sort((a, b) => (by === "size" ? a.size - b.size : by === "album" ? a.album.localeCompare(b.album, i18n.lang, { numeric: true }) || compare(a, b) : compare(a, b)) * (direction === "desc" ? -1 : 1));

  const ready = state.phase === "ready";
  const signedOut = state.phase === "signedOut";
  els.refreshButton.disabled = signedOut || state.phase === "loading";
  els.albumSelect.disabled = !state.items.length;
  if (ready) urlState.set({ album: els.albumSelect.value, q: els.musicSearch.value.trim(), sort: els.sortOrder.selectedIndex === 0 ? "" : els.sortOrder.value });

  els.trackList.classList.toggle("hidden", !state.shown.length || !ready);
  els.emptyState.classList.toggle("hidden", !!state.shown.length && ready);
  els.emptyActionButton.classList.toggle("hidden", !signedOut);
  if (state.phase === "loading") { els.emptyState.heading = tr("loading"); els.emptyState.text = ""; }
  else if (signedOut) { els.emptyState.heading = tr("signedout.title"); els.emptyState.text = tr("signedout.text"); }
  else if (query && inThisAlbum.length) { els.emptyState.heading = tr("empty.noMatches"); els.emptyState.text = tr("empty.noMatchesText", { query: els.musicSearch.value.trim() }); }
  else { els.emptyState.heading = tr("empty.title"); els.emptyState.text = tr("empty.text"); }

  els.trackList.replaceChildren(...(ready ? state.shown.map(makeTrack) : []));
  markPlaying();
  const total = state.shown.reduce((sum, item) => sum + item.size, 0);
  els.status.textContent = !ready ? "" : state.truncated ? tr("status.truncated")
    : state.shown.length === state.items.length ? tr("status.items", { count: i18n.number(state.items.length), size: formatSize(total) })
    : tr("status.filtered", { shown: i18n.number(state.shown.length), total: i18n.number(state.items.length) });
}

function makeTrack(item, index) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "track";
  row.dataset.path = item.path;
  row.title = item.path;
  row.setAttribute("aria-label", tr("track.play", { name: item.title }));
  const icon = document.createElement("span");
  icon.className = "track-icon";
  const title = document.createElement("span"); title.className = "track-title"; title.textContent = item.title;
  const album = document.createElement("span"); album.className = "track-album"; album.textContent = albumLabel(item);
  const size = document.createElement("span"); size.className = "track-size"; size.textContent = formatSize(item.size);
  row.append(icon, title, album, size);
  row.addEventListener("click", () => {
    if (state.now?.path === item.path) return togglePlay();
    state.queue = [...state.shown];
    state.queueIndex = index;
    state.history = [];
    playCurrent();
  });
  return row;
}
function markPlaying() {
  for (const row of els.trackList.children) {
    const playing = row.dataset.path === state.now?.path;
    row.classList.toggle("playing", playing);
    const slot = row.firstChild;
    slot.replaceChildren();
    if (playing) { const icon = document.createElement("span"); icon.className = `icon icon-${audio.paused ? "play" : "pause"}`; slot.appendChild(icon); }
  }
}

const loaded = new Map();
let loadToken = 0;
async function wholeFileUrl(item) {
  if (!loaded.has(item.path)) {
    const bytes = await storage.readBinary(state.store, item.path);
    if (!bytes) throw new Error("not found");
    loaded.set(item.path, URL.createObjectURL(new Blob([bytes], { type: mimeTypes[extensionOf(item.name)] || "application/octet-stream" })));
    while (loaded.size > limits.cacheSize) {
      const [oldest, url] = loaded.entries().next().value;
      loaded.delete(oldest);
      URL.revokeObjectURL(url);
    }
  }
  return loaded.get(item.path);
}

async function playCurrent() {
  const item = state.queue[state.queueIndex];
  if (!item) return;
  const token = ++loadToken;
  state.now = item;
  els.playerName.textContent = tr("player.loading", { name: item.title });
  markPlaying();
  try {
    const url = await wholeFileUrl(item);
    if (token !== loadToken) return;
    audio.src = url;
    await audio.play();
    els.playerName.textContent = item.title;
    updateMediaSession(item);
    const next = state.queue[state.queueIndex + 1];
    if (next && !playback.shuffle) wholeFileUrl(next).catch(() => {});
  } catch (error) {
    if (token !== loadToken) return;
    els.playerName.textContent = item.title;
    popups.toast(tr("player.failed", { message: error.message }), { kind: "error" });
  }
}
function togglePlay() {
  if (!state.now) {
    if (!state.shown.length) return;
    state.queue = [...state.shown]; state.queueIndex = 0; state.history = [];
    return playCurrent();
  }
  if (audio.paused) audio.play().catch((error) => popups.toast(tr("player.failed", { message: error.message }), { kind: "error" }));
  else audio.pause();
}
function advance(direction, automatic) {
  const total = state.queue.length;
  if (!total) return;
  if (automatic && playback.repeat === "one") { audio.currentTime = 0; audio.play(); return; }
  let index;
  if (playback.shuffle && total > 1) {
    if (direction < 0 && state.history.length) index = state.history.pop();
    else if (direction < 0) index = (state.queueIndex - 1 + total) % total;
    else {
      do { index = Math.floor(Math.random() * total); } while (index === state.queueIndex);
      state.history.push(state.queueIndex);
    }
  } else {
    index = state.queueIndex + direction;
    if (index >= total || index < 0) {
      if (automatic && playback.repeat !== "all") { audio.pause(); audio.currentTime = 0; return; }
      index = (index + total) % total;
    }
  }
  state.queueIndex = index;
  playCurrent();
}

audio.addEventListener("ended", () => advance(1, true));
audio.addEventListener("play", () => { setPlayIcon(); markPlaying(); });
audio.addEventListener("pause", () => { setPlayIcon(); markPlaying(); });
audio.addEventListener("durationchange", () => { els.seekSlider.max = Number.isFinite(audio.duration) ? audio.duration : 0; els.seekSlider.disabled = !Number.isFinite(audio.duration); });
audio.addEventListener("timeupdate", () => {
  els.seekSlider.value = audio.currentTime;
  els.playerTime.textContent = `${clock(audio.currentTime)} / ${clock(audio.duration)}`;
});
function setPlayIcon() {
  els.playIcon.className = `icon icon-${audio.paused ? "play" : "pause"}`;
  const label = tr(audio.paused ? "player.play" : "player.pause");
  els.playButton.title = label;
  els.playButton.setAttribute("aria-label", label);
}

els.playButton.addEventListener("click", togglePlay);
els.nextButton.addEventListener("click", () => advance(1, false));
els.previousButton.addEventListener("click", () => { if (audio.currentTime > 3) audio.currentTime = 0; else advance(-1, false); });
els.seekSlider.addEventListener("input", () => { audio.currentTime = Number(els.seekSlider.value); });
els.volumeSlider.addEventListener("input", () => { playback.volume = Number(els.volumeSlider.value); audio.volume = playback.volume; saveSettings(); });
els.shuffleButton.addEventListener("click", () => { playback.shuffle = !playback.shuffle; state.history = []; applySettings(); saveSettings(); });
els.repeatButton.addEventListener("click", () => { playback.repeat = repeatModes[(repeatModes.indexOf(playback.repeat) + 1) % repeatModes.length]; applySettings(); saveSettings(); });
document.addEventListener("keydown", (event) => {
  if (event.key !== " " || event.defaultPrevented || document.querySelector("dialog[open]")) return;
  if (event.target.closest("input, textarea, select, button, a")) return;
  event.preventDefault();
  togglePlay();
});

function updateMediaSession(item) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: albumLabel(item), artwork: [{ src: new URL("favicon.png", location.href).href, sizes: "16x16", type: "image/png" }] });
}
if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("previoustrack", () => els.previousButton.click());
  navigator.mediaSession.setActionHandler("nexttrack", () => advance(1, false));
}

els.musicSearch.addEventListener("input", render);
els.albumSelect.addEventListener("change", render);
els.sortOrder.addEventListener("change", render);
els.refreshButton.addEventListener("click", loadFiles);
autocomplete.attach(els.musicSearch, { suggestions: () => state.items.filter(inAlbum).map((item) => item.title) });

account.bind(els.accountButton);
els.emptyActionButton.addEventListener("click", () => account.open());
account.onChange((signedIn) => { if ((signedIn?.token || "") !== state.token) loadFiles(); });
i18n.onChange(() => { render(); applySettings(); setPlayIcon(); if (!state.now) els.playerName.textContent = tr("player.nothing"); });

applySettings();
setPlayIcon();
els.playerName.textContent = tr("player.nothing");
els.playerTime.textContent = `${clock(0)} / ${clock(0)}`;
els.musicSearch.value = urlState.get("q");
if ([...els.sortOrder.options].some((option) => option.value === urlState.get("sort"))) els.sortOrder.value = urlState.get("sort");
loadFiles();
