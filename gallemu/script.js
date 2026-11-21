// Gallemu: the photos and videos of the user's Drive (the drivemu branch), in one gallery.
await i18n.load();
i18n.selects();

const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "gallery-search", "album-select", "sort-order", "refresh-button", "gallery", "gallery-grid", "empty-state", "empty-title", "empty-text", "empty-action-button",
  "status", "viewer-dialog", "viewer-name", "viewer-counter", "viewer-download-button", "viewer-close-button", "viewer-image", "viewer-video", "viewer-message",
  "viewer-previous-button", "viewer-next-button", "account-button"
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

// The media types, the limits and the branch are in data.json.
const { media, limits, mimeTypes, storageBranch } = i18n.data;
const KIND_OF = new Map(Object.entries(media).flatMap(([kind, extensions]) => extensions.map((extension) => [extension, kind])));
const ALL = "", ROOT = "/";   // the values of the album select: every album, and the files at the root of the Drive

const state = {
  token: "",       // the token the store was opened with
  store: null,
  phase: "signedOut",   // signedOut, loading, ready, or failed
  truncated: false,
  items: [],       // every photo and video: { path, name, album, size, kind }
  shown: [],       // what the album, the search and the sort leave
  viewIndex: -1,
};

const extensionOf = (name) => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");
const sizeText = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes, i = -1;
  do { value /= 1024; i++; } while (value >= 1024 && i < units.length - 1);
  return `${i18n.number(value, { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[i]}`;
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
    state.items = files.filter((file) => KIND_OF.has(extensionOf(file.path))).map((file) => {
      const parts = file.path.split("/");
      const name = parts.pop();
      return { path: file.path, name, album: parts.join("/"), size: file.size, kind: KIND_OF.get(extensionOf(name)) };
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

/* ---------- the albums: the folders that hold photos or videos ---------- */
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

/* ---------- the grid ---------- */
const thumbnails = new Map();   // path -> the address of its small picture
let generation = 0;             // changes at every render, so a picture that finishes late does not land on a tile that is gone

function render() {
  generation++;
  queue.length = 0;
  renderAlbums();
  const query = els.gallerySearch.value.trim().toLowerCase();
  const [by, direction] = els.sortOrder.value.split("-");
  const inThisAlbum = state.items.filter(inAlbum);
  state.shown = inThisAlbum.filter((item) => !query || item.name.toLowerCase().includes(query));
  state.shown.sort((a, b) => (by === "size" ? a.size - b.size : a.name.localeCompare(b.name, i18n.lang, { numeric: true })) * (direction === "desc" ? -1 : 1));

  const ready = state.phase === "ready";
  const signedOut = state.phase === "signedOut";
  els.refreshButton.disabled = signedOut || state.phase === "loading";
  els.albumSelect.disabled = !state.items.length;

  els.galleryGrid.classList.toggle("hidden", !state.shown.length || !ready);
  els.emptyState.classList.toggle("hidden", !!state.shown.length && ready);
  els.emptyActionButton.classList.toggle("hidden", !signedOut);
  if (state.phase === "loading") { els.emptyTitle.textContent = tr("loading"); els.emptyText.textContent = ""; }
  else if (signedOut) { els.emptyTitle.textContent = tr("signedout.title"); els.emptyText.textContent = tr("signedout.text"); }
  else if (query && inThisAlbum.length) { els.emptyTitle.textContent = tr("empty.noMatches"); els.emptyText.textContent = tr("empty.noMatchesText", { query: els.gallerySearch.value.trim() }); }
  else { els.emptyTitle.textContent = tr("empty.title"); els.emptyText.textContent = tr("empty.text"); }

  els.galleryGrid.replaceChildren(...(ready ? state.shown.map(makeTile) : []));
  const total = state.shown.reduce((sum, item) => sum + item.size, 0);
  els.status.textContent = !ready ? "" : state.truncated ? tr("status.truncated")
    : state.shown.length === state.items.length ? tr("status.items", { count: i18n.number(state.items.length), size: sizeText(total) })
    : tr("status.filtered", { shown: i18n.number(state.shown.length), total: i18n.number(state.items.length) });
}

function makeTile(item, index) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "tile";
  tile.dataset.index = index;
  tile.title = item.name;
  tile.setAttribute("aria-label", tr("tile.open", { name: item.name }));
  const placeholder = document.createElement("span");
  placeholder.className = `icon icon-${item.kind}`;
  const name = document.createElement("span");
  name.className = "tile-name";
  name.textContent = item.name;
  tile.append(placeholder, name);
  if (item.kind === "image" && item.size <= limits.thumbnailMaxMB * 1024 * 1024) {
    if (thumbnails.has(item.path)) showThumbnail(tile, thumbnails.get(item.path));
    else observer.observe(tile);
  }
  tile.addEventListener("click", () => openViewer(index));
  transfer.drag(tile, () => fileOf(item));   // the picture can be dragged out of the page, as a file
  return tile;
}
const showThumbnail = (tile, url) => { tile.style.backgroundImage = `url("${url}")`; tile.classList.add("loaded"); };

/* The small pictures are made when a tile comes near the screen, a few at a time. */
const queue = [];
let active = 0;
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    queue.push({ tile: entry.target, generation });
  }
  pump();
}, { root: els.gallery, rootMargin: "200px" });
function pump() {
  while (active < limits.concurrentLoads && queue.length) {
    const job = queue.shift();
    if (job.generation !== generation || !job.tile.isConnected) continue;
    active++;
    makeThumbnail(job).finally(() => { active--; pump(); });
  }
}
async function makeThumbnail({ tile, generation: made }) {
  const item = state.shown[Number(tile.dataset.index)];
  try {
    const blob = await readBlob(item);
    let url;
    try {
      const bitmap = await createImageBitmap(blob, { resizeWidth: limits.thumbnailSize, resizeQuality: "medium" });
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      bitmap.close();
      url = URL.createObjectURL(await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.8)));
    } catch { url = URL.createObjectURL(blob); }   // a picture the browser cannot shrink (an SVG, for one) is shown as it is
    thumbnails.set(item.path, url);
    if (made === generation) showThumbnail(tile, url);
  } catch { /* the tile keeps its icon */ }
}
// What transfer.drag needs to drag a file of the Drive out of the page
const fileOf = (item) => ({ id: item.path, name: item.name, size: item.size, image: item.kind === "image", load: () => readBlob(item) });
async function readBlob(item) {
  const bytes = await storage.readBinary(state.store, item.path);
  if (!bytes) throw new Error("not found");
  return new Blob([bytes], { type: mimeTypes[extensionOf(item.name)] || "application/octet-stream" });
}

/* ---------- the viewer ---------- */
const opened = new Map();   // path -> the address of the whole file, for the last few files that were opened
let viewToken = 0;
let opener = null;   // what had the focus before the viewer opened, to give it back

function openViewer(index) {
  opener = document.activeElement;
  state.viewIndex = index;
  showCurrent();
  if (!els.viewerDialog.open) els.viewerDialog.showModal();
  els.viewerCloseButton.focus();
}
async function showCurrent() {
  const item = state.shown[state.viewIndex];
  if (!item) return;
  const token = ++viewToken;
  els.viewerName.textContent = item.name;
  els.viewerCounter.textContent = tr("viewer.counter", { index: i18n.number(state.viewIndex + 1), total: i18n.number(state.shown.length) });
  els.viewerPreviousButton.disabled = els.viewerNextButton.disabled = state.shown.length < 2;
  els.viewerImage.style.backgroundImage = "";
  els.viewerImage.classList.toggle("hidden", item.kind !== "image");
  els.viewerImage.setAttribute("aria-label", item.name);
  stopVideo();
  els.viewerVideo.classList.add("hidden");
  els.viewerMessage.textContent = tr("viewer.loading");
  els.viewerMessage.classList.remove("hidden");
  try {
    const url = await wholeFileUrl(item);
    if (token !== viewToken) return;
    if (item.kind === "video") { els.viewerVideo.src = url; els.viewerVideo.classList.remove("hidden"); }
    else els.viewerImage.style.backgroundImage = `url("${url}")`;
    els.viewerMessage.classList.add("hidden");
  } catch (error) {
    if (token === viewToken) els.viewerMessage.textContent = tr("viewer.failed", { message: error.message });
  }
}
async function wholeFileUrl(item) {
  if (!opened.has(item.path)) {
    opened.set(item.path, URL.createObjectURL(await readBlob(item)));
    while (opened.size > limits.viewerCacheSize) {   // the oldest ones are let go
      const [oldest, url] = opened.entries().next().value;
      opened.delete(oldest);
      URL.revokeObjectURL(url);
    }
  }
  return opened.get(item.path);
}
// What the viewer shows can be dragged out of the page too (a picture as a picture, a video as a link)
for (const media of [els.viewerImage, els.viewerVideo]) {
  transfer.drag(media, () => {
    const item = state.shown[state.viewIndex];
    return item && fileOf(item);
  });
}
function stopVideo() { els.viewerVideo.pause(); els.viewerVideo.removeAttribute("src"); els.viewerVideo.load(); }
function step(by) {
  if (state.shown.length < 2) return;
  state.viewIndex = (state.viewIndex + by + state.shown.length) % state.shown.length;
  showCurrent();
}
els.viewerPreviousButton.addEventListener("click", () => step(-1));
els.viewerNextButton.addEventListener("click", () => step(1));
els.viewerCloseButton.addEventListener("click", () => els.viewerDialog.close());
els.viewerDialog.addEventListener("close", () => { viewToken++; stopVideo(); state.viewIndex = -1; opener?.focus(); });
els.viewerDialog.addEventListener("keydown", (event) => {
  const forward = document.documentElement.dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const back = document.documentElement.dir === "rtl" ? "ArrowRight" : "ArrowLeft";
  if (event.target === els.viewerVideo && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return;   // the arrows seek inside a video
  if (event.key === forward) { event.preventDefault(); step(1); }
  else if (event.key === back) { event.preventDefault(); step(-1); }
});
els.viewerDownloadButton.addEventListener("click", async () => {
  const item = state.shown[state.viewIndex];
  if (!item) return;
  const link = document.createElement("a");
  link.href = await wholeFileUrl(item);
  link.download = item.name;
  link.click();
});

/* ---------- the toolbar, the settings, the account ---------- */
els.gallerySearch.addEventListener("input", render);
els.albumSelect.addEventListener("change", render);
els.sortOrder.addEventListener("change", render);
els.refreshButton.addEventListener("click", loadFiles);
autocomplete.attach(els.gallerySearch, { suggestions: () => state.items.filter(inAlbum).map((item) => item.name) });


account.bind(els.accountButton);
els.emptyActionButton.addEventListener("click", () => account.open());
account.onChange((signedIn) => { if ((signedIn?.token || "") !== state.token) loadFiles(); });
i18n.onChange(() => { render(); if (els.viewerDialog.open) showCurrent(); });

loadFiles();
