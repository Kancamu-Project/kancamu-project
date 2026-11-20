// Spotimu: the audio files of the user's Drive (the drivemu branch), with a player.
await i18n.load();
i18n.selects();

const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "music-search", "album-select", "sort-order", "refresh-button", "track-list", "empty-state", "empty-title", "empty-text", "empty-action-button",
  "player-name", "player-time", "seek-slider", "shuffle-button", "previous-button", "play-button", "play-icon", "next-button", "repeat-button", "repeat-mark", "volume-slider",
  "status", "audio-element", "account-button"
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));
const audio = els.audioElement;

// The audio types, the limits, the first values of the settings, and the branch are in data.json.
const { media, limits, mimeTypes, storageBranch, settings: { defaults }, repeatModes } = i18n.data;
const AUDIO = new Set(media.audio);
const ALL = "", ROOT = "/";   // the values of the album select: every album, and the files at the root of the Drive

const state = {
  token: "",       // the token the store was opened with
  store: null,
  phase: "signedOut",   // signedOut, loading, ready, or failed
  truncated: false,
  items: [],       // every track: { path, name, title, album, size }
  shown: [],       // what the album, the search and the sort leave
  queue: [],       // the tracks that play one after the other: what was shown when a track was started
  queueIndex: -1,
  history: [],     // the tracks played before, for the previous button when the order is shuffled
  now: null,       // the track that is loaded in the player
};

/* ---------- the playback settings (volume, shuffle, repeat): the player and the account web both set them, and each follows the other ---------- */
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

const extensionOf = (name) => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");
const sizeText = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes, i = -1;
  do { value /= 1024; i++; } while (value >= 1024 && i < units.length - 1);
  return `${i18n.number(value, { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[i]}`;
};
const clock = (seconds) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};
function toast(text) {
  const note = document.createElement("div");
  note.className = "toast";
  note.textContent = text;
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 6000);
}

/* ---------- the files ---------- */
async function loadFiles() {
  const signedIn = account.get();
  if (!signedIn) {
    Object.assign(state, { token: "", store: null, items: [], phase: "signedOut" });
    return render();
  }
  state.phase = "loading";
  render();
  try {
    if (!state.store || state.token !== signedIn.token) { state.store = await storage.connect(storageBranch); state.token = signedIn.token; }
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
    if (error.status === 401) { toast(tr("acct.tokenInvalid", { name: signedIn.login || tr("acct.anAccount") })); account.signOut(); state.phase = "signedOut"; }
    else toast(tr("load.failed", { message: error.message }));
  }
  render();
}

/* ---------- the albums: the folders that hold audio files ---------- */
function renderAlbums() {
  const counts = new Map();
  for (const item of state.items) counts.set(item.album || ROOT, (counts.get(item.album || ROOT) || 0) + 1);
  const chosen = els.albumSelect.value;
  const option = (value, label) => Object.assign(document.createElement("option"), { value, textContent: label });
  els.albumSelect.replaceChildren(
    option(ALL, `${tr("album.all")} (${state.items.length})`),
    ...[...counts.keys()].sort((a, b) => a.localeCompare(b, i18n.lang, { numeric: true })).map((album) => option(album, `${album === ROOT ? tr("album.root") : album} (${counts.get(album)})`)),
  );
  els.albumSelect.value = counts.has(chosen) ? chosen : ALL;
}
const inAlbum = (item) => els.albumSelect.value === ALL || (item.album || ROOT) === els.albumSelect.value;
const albumLabel = (item) => item.album || tr("album.root");

/* ---------- the list of tracks ---------- */
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

  els.trackList.classList.toggle("hidden", !state.shown.length || !ready);
  els.emptyState.classList.toggle("hidden", !!state.shown.length && ready);
  els.emptyActionButton.classList.toggle("hidden", !signedOut);
  if (state.phase === "loading") { els.emptyTitle.textContent = tr("loading"); els.emptyText.textContent = ""; }
  else if (signedOut) { els.emptyTitle.textContent = tr("signedout.title"); els.emptyText.textContent = tr("signedout.text"); }
  else if (query && inThisAlbum.length) { els.emptyTitle.textContent = tr("empty.noMatches"); els.emptyText.textContent = tr("empty.noMatchesText", { query: els.musicSearch.value.trim() }); }
  else { els.emptyTitle.textContent = tr("empty.title"); els.emptyText.textContent = tr("empty.text"); }

  els.trackList.replaceChildren(...(ready ? state.shown.map(makeTrack) : []));
  markPlaying();
  const total = state.shown.reduce((sum, item) => sum + item.size, 0);
  els.status.textContent = !ready ? "" : state.truncated ? tr("status.truncated")
    : state.shown.length === state.items.length ? tr("status.items", { count: i18n.number(state.items.length), size: sizeText(total) })
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
  const size = document.createElement("span"); size.className = "track-size"; size.textContent = sizeText(item.size);
  row.append(icon, title, album, size);
  row.addEventListener("click", () => {
    if (state.now?.path === item.path) return togglePlay();   // the track that is loaded: the same as the play button
    state.queue = [...state.shown];
    state.queueIndex = index;
    state.history = [];
    playCurrent();
  });
  return row;
}
// The row of the track that is loaded shows a play or pause icon.
function markPlaying() {
  for (const row of els.trackList.children) {
    const playing = row.dataset.path === state.now?.path;
    row.classList.toggle("playing", playing);
    const slot = row.firstChild;
    slot.replaceChildren();
    if (playing) { const icon = document.createElement("span"); icon.className = `icon icon-${audio.paused ? "play" : "pause"}`; slot.appendChild(icon); }
  }
}

/* ---------- the player ---------- */
const loaded = new Map();   // path -> the address of the whole file, for the last few tracks
let loadToken = 0;
async function wholeFileUrl(item) {
  if (!loaded.has(item.path)) {
    const bytes = await storage.readBinary(state.store, item.path);
    if (!bytes) throw new Error("not found");
    loaded.set(item.path, URL.createObjectURL(new Blob([bytes], { type: mimeTypes[extensionOf(item.name)] || "application/octet-stream" })));
    while (loaded.size > limits.cacheSize) {   // the oldest ones are let go
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
    const next = state.queue[state.queueIndex + 1];   // the next one is read while this one plays, so it starts at once
    if (next && !playback.shuffle) wholeFileUrl(next).catch(() => {});
  } catch (error) {
    if (token !== loadToken) return;
    els.playerName.textContent = item.title;
    toast(tr("player.failed", { message: error.message }));
  }
}
function togglePlay() {
  if (!state.now) {   // nothing loaded yet: the first track of the list
    if (!state.shown.length) return;
    state.queue = [...state.shown]; state.queueIndex = 0; state.history = [];
    return playCurrent();
  }
  if (audio.paused) audio.play().catch((error) => toast(tr("player.failed", { message: error.message })));
  else audio.pause();
}
// direction is 1 for the next track and -1 for the previous one; automatic is true when a track ended by itself.
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
      if (automatic && playback.repeat !== "all") { audio.pause(); audio.currentTime = 0; return; }   // the end of the list
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
// Space plays and pauses when the focus is not on something that uses the key itself.
document.addEventListener("keydown", (event) => {
  if (event.key !== " " || event.defaultPrevented || document.querySelector("dialog[open]")) return;
  if (event.target.closest("input, textarea, select, button, a")) return;
  event.preventDefault();
  togglePlay();
});

// The keys and the lock screen of the device control the player too.
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

/* ---------- the toolbar, the settings, the account ---------- */
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
loadFiles();
