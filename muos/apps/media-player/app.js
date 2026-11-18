import { os, t, i18n, fs, h, icon, fillSlider, pickFile, kindOf, alertDialog, promptDialog, confirmDialog, basename, dirname, KNOWN_FOLDERS, formatBytes, readJSON, writeJSON } from 'webos/sdk/app.js';

await os.ready;

const $ = (id) => document.getElementById(id);
const video = $('video');
const player = $('player');
const library = $('library');
const nowEl = $('now');
const queueEl = $('queue');
const artEl = $('art');
const els = { seek: $('seek'), elapsed: $('elapsed'), total: $('total'), play: $('play'), prev: $('prev'), next: $('next'), loop: $('loop'), shuffle: $('shuffle'), mute: $('mute'), volume: $('volume'), full: $('full'), mini: $('mini'), more: $('more'), info: $('info') };

/** Glyph drawings (24 x 24). Filled unless the path says otherwise. */
const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const GLYPH = {
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
  prev: '<path d="M6 5h2v14H6zM20 5v14L9 12z"/>',
  next: '<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>',
  loop: `<path ${STROKE} d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/>`,
  loopOne: `<path ${STROKE} d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4M11 10l1.5-1v6"/>`,
  shuffle: `<path ${STROKE} d="M3 7h3.5c5 0 5 10 10 10H21M3 17h3.5c1.5 0 2.600-.7 3.500-1.800M13.500 8.800C14.400 7.700 15.500 7 17 7h4M18 4l3 3-3 3M18 14l3 3-3 3"/>`,
  full: `<path ${STROKE} d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`,
  mini: `<path ${STROKE} d="M4 6h16v12H4zM12 12h6v4h-6z"/>`,
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  home: `<path ${STROKE} d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>`,
  music: `<path ${STROKE} d="M9 18V6l10-2v12M9 18a2.500 2.500 0 1 1-5 0 2.500 2.500 0 0 1 5 0zM19 16a2.500 2.500 0 1 1-5 0 2.500 2.500 0 0 1 5 0z"/>`,
  artist: `<path ${STROKE} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0"/>`,
  album: `<path ${STROKE} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z"/>`,
  video: `<path ${STROKE} d="M4 6h12v12H4zM16 10l4-2.500v9L16 14z"/>`,
  playlist: `<path ${STROKE} d="M4 7h12M4 12h12M4 17h7M18 14v5M15.500 19a2.500 2.500 0 1 0 5 0"/>`,
  now: `<path ${STROKE} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/><path d="M10 8.500v7l6-3.500z"/>`,
  plus: `<path ${STROKE} d="M12 5v14M5 12h14"/>`,
  dismiss: `<path ${STROKE} d="M6 6l12 12M18 6L6 18"/>`
};

function glyph(name, size) {
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"${size ? ` width="${size}" height="${size}"` : ''}>${GLYPH[name]}</svg>`;
  return span.firstChild;
}

function setGlyph(btn, name, tip) {
  btn.replaceChildren(glyph(name));
  if (tip) {
    btn.dataset.tip = tip;
    btn.setAttribute('aria-label', tip);
  }
}

const hueOf = (text) => [...String(text)].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 360, 7);

const state = {
  view: 'home', // home | songs | artists | albums | videos | playlists | now
  filter: null, // { kind: 'artist' | 'album' | 'playlist', value }
  songs: [],
  videos: [],
  queue: [],
  index: -1,
  shuffle: false,
  repeat: 'off', // 'off' | 'all' | 'one'
  speed: 1,
  mini: false,
  blobs: new Set(),
  playlists: readJSON('player.playlists', []),
  recent: readJSON('player.recent', [])
};

const clock = (s) => {
  if (!Number.isFinite(s)) return '0:00';
  const hours = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return hours ? `${hours}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

const persist = (key, value) => {
  try {
    writeJSON(key, value);
  } catch {
    /* the disk is full: it works for this session */
  }
};

/* ---------------------------------- library ---------------------------------- */

function toItem(entry) {
  const base = entry.name.replace(/\.[^.]+$/, '');
  const m = /^(.+?)\s+-\s+(.+)$/.exec(base);
  const folder = dirname(entry.path);
  const root = [KNOWN_FOLDERS.music, KNOWN_FOLDERS.videos].some((r) => r.toLowerCase() === folder.toLowerCase());
  return { id: entry.path, path: entry.path, name: entry.name, title: m ? m[2] : base, artist: m ? m[1] : '', album: root ? '' : basename(folder), url: entry.url, audio: kindOf(entry) === 'audio', size: entry.size ?? 0 };
}

function scan() {
  const walk = (dir, kind, out) => {
    let entries = [];
    try {
      entries = fs.list(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.type === 'dir') walk(e.path, kind, out);
      else if (e.url && kindOf(e) === kind) out.push(toItem(e));
    }
  };
  const songs = [];
  const videos = [];
  walk(KNOWN_FOLDERS.music, 'audio', songs);
  walk(KNOWN_FOLDERS.videos, 'video', videos);
  const collator = new Intl.Collator(i18n.lang, { numeric: true, sensitivity: 'base' });
  state.songs = songs.sort((a, b) => collator.compare(a.title, b.title));
  state.videos = videos.sort((a, b) => collator.compare(a.title, b.title));
}

const everything = () => [...state.songs, ...state.videos];
const byPath = (path) => everything().find((item) => item.path === path) ?? null;
const artistName = (item) => item.artist || t('player.unknownArtist');
const albumName = (item) => item.album || t('player.unknownAlbum');

/* ----------------------------------- queue ----------------------------------- */

const current = () => state.queue[state.index] ?? null;

function play(i) {
  const item = state.queue[i];
  if (!item) return;
  state.index = i;
  video.src = item.url;
  video.playbackRate = state.speed;
  video.loop = state.repeat === 'one';
  video.classList.toggle('is-audio', item.audio);
  els.seek.disabled = false;
  video.play().catch(() => {});
  os.window.setTitle(`${item.title ?? item.name} - ${t('app.name')}`);
  if (item.path) {
    state.recent = [item.path, ...state.recent.filter((path) => path !== item.path)].slice(0, 12);
    persist('player.recent', state.recent);
  }
  renderPlaying();
}

/** Play a list, starting at one of its items; it becomes the queue. */
function playList(list, index = 0, { shuffle = false } = {}) {
  if (!list.length) return;
  state.queue = list.slice();
  if (shuffle) state.shuffle = true;
  play(shuffle ? Math.floor(Math.random() * list.length) : index);
  syncModes();
}

function addToQueue(items, { next = false } = {}) {
  if (!items.length) return;
  if (!state.queue.length) return playList(items);
  if (next) state.queue.splice(state.index + 1, 0, ...items);
  else state.queue.push(...items);
  renderPlaying();
}

function removeFromQueue(i) {
  if (i === state.index) {
    state.queue.splice(i, 1);
    if (!state.queue.length) return clearQueue();
    return play(Math.min(i, state.queue.length - 1));
  }
  state.queue.splice(i, 1);
  if (i < state.index) state.index--;
  renderPlaying();
}

function clearQueue() {
  state.queue = [];
  state.index = -1;
  video.pause();
  video.removeAttribute('src');
  video.load();
  els.seek.disabled = true;
  os.window.setTitle('');
  syncTime();
  renderPlaying();
}

function step(delta) {
  const n = state.queue.length;
  if (!n) return;
  if (delta < 0 && video.currentTime > 3) {
    video.currentTime = 0;
    return;
  }
  if (state.shuffle && n > 1) {
    let next = state.index;
    while (next === state.index) next = Math.floor(Math.random() * n);
    return play(next);
  }
  play((state.index + delta + n) % n);
}

function onEnded() {
  const n = state.queue.length;
  if (state.repeat === 'one' || !n) return;
  const last = state.index === n - 1;
  if (last && state.repeat === 'off' && !state.shuffle) return;
  if (n > 1 || state.repeat === 'all') step(1);
}

/* ----------------------------------- sources --------------------------------- */

const fromEntry = (entry) => toItem(entry);

function openFromDisk() {
  pickFile({ mode: 'open', filter: (e) => e.url && ['audio', 'video'].includes(kindOf(e)), dir: KNOWN_FOLDERS.music }).then((path) => {
    const entry = path && fs.stat(path);
    if (entry) playList([fromEntry(entry)]);
  });
}

function openLocal() {
  const input = h('input', { type: 'file', accept: 'audio/*,video/*', multiple: true });
  input.addEventListener('change', () => addFiles(input.files));
  input.click();
}

function addFiles(files) {
  const items = [];
  for (const file of files) {
    if (!/^(audio|video)\//.test(file.type)) continue;
    const url = URL.createObjectURL(file);
    state.blobs.add(url);
    const base = file.name.replace(/\.[^.]+$/, '');
    items.push({ id: url, name: file.name, title: base, artist: '', album: '', url, audio: file.type.startsWith('audio/'), size: file.size });
  }
  if (items.length) {
    playList(items);
    setView('now');
  } else if (files.length) alertDialog(t('app.name'), t('player.unsupported'));
}

/* --------------------------------- playlists --------------------------------- */

const savePlaylists = () => persist('player.playlists', state.playlists);
const playlistItems = (pl) => pl.paths.map(byPath).filter(Boolean);

async function newPlaylist(paths = []) {
  const name = await promptDialog(t('player.playlists.new'), t('player.playlists.namePrompt'), { okLabel: t('common.ok'), value: t('player.playlists.defaultName', { n: state.playlists.length + 1 }) });
  if (!name?.trim()) return null;
  const pl = { id: `p${Date.now().toString(36)}`, name: name.trim().slice(0, 60), paths: [...paths] };
  state.playlists.push(pl);
  savePlaylists();
  render();
  return pl;
}

function addToPlaylist(pl, items) {
  for (const item of items) if (item.path && !pl.paths.includes(item.path)) pl.paths.push(item.path);
  savePlaylists();
  render();
}

/* ------------------------------------ menus ---------------------------------- */

function itemMenu(item, event, { playlist = null } = {}) {
  const paths = item.path ? [item.path] : [];
  os.menu(
    [
      { label: t('player.play'), action: () => playList([item]) },
      { label: t('player.playNext'), action: () => addToQueue([item], { next: true }) },
      { label: t('player.addToQueue'), action: () => addToQueue([item]) },
      item.path && {
        label: t('player.addToPlaylist'),
        items: [...state.playlists.map((pl) => ({ label: pl.name, action: () => addToPlaylist(pl, [item]) })), state.playlists.length ? { separator: true } : null, { label: t('player.playlists.new'), action: async () => (await newPlaylist(paths)) }].filter(Boolean)
      },
      playlist && { label: t('player.removeFromPlaylist'), action: () => ((playlist.paths = playlist.paths.filter((p) => p !== item.path)), savePlaylists(), render()) },
      item.path && { label: t('player.showInFolder'), action: () => os.openPath(dirname(item.path)) }
    ],
    event
  );
}

/* ------------------------------------ views ---------------------------------- */

const NAV = [
  ['home', 'home'],
  ['songs', 'music', 'group'],
  ['artists', 'artist'],
  ['albums', 'album'],
  ['videos', 'video'],
  ['playlists', 'playlist', 'group2'],
  ['now', 'now']
];

function renderNav() {
  const nav = $('nav');
  nav.replaceChildren();
  for (const [view, glyphName, group] of NAV) {
    if (group === 'group') nav.append(h('div', { class: 'nav-group' }, t('player.nav.library')));
    if (group === 'group2') nav.append(h('div', { class: 'nav-group' }, t('player.nav.collections')));
    const b = h('button', { class: `nav-item${state.view === view ? ' is-active' : ''}`, type: 'button', 'data-tip': t(`player.nav.${view}`) }, glyph(glyphName), h('span', null, t(`player.nav.${view}`)));
    b.addEventListener('click', () => setView(view));
    nav.append(b);
  }
}

function setView(view, filter = null) {
  state.view = view;
  state.filter = filter;
  render();
}

function head(title, ...actions) {
  return h('div', { class: 'view-head' }, h('h1', null, title), ...actions);
}

function actionButton(glyphName, label, action, { accent = false } = {}) {
  const b = h('button', { class: `btn${accent ? ' btn-accent' : ''}`, type: 'button' }, glyph(glyphName), label);
  b.addEventListener('click', action);
  return b;
}

function songsTable(list, { playlist = null } = {}) {
  if (!list.length) return h('p', { class: 'empty' }, t('player.empty'));
  const body = h('tbody');
  list.forEach((item, i) => {
    const row = h('tr', { class: current()?.id === item.id ? 'is-current' : '', tabIndex: 0 }, h('td', null, item.title), h('td', null, artistName(item)), h('td', null, albumName(item)), h('td', null, item.size ? formatBytes(item.size) : ''));
    row.addEventListener('dblclick', () => playList(list, i));
    row.addEventListener('keydown', (e) => e.key === 'Enter' && playList(list, i));
    row.addEventListener('contextmenu', (e) => (e.preventDefault(), itemMenu(item, e, { playlist })));
    body.append(row);
  });
  return h('table', { class: 'songs' }, h('thead', null, h('tr', null, h('th', { style: { width: '40%' } }, t('player.cols.title')), h('th', { style: { width: '25%' } }, t('player.cols.artist')), h('th', { style: { width: '25%' } }, t('player.cols.album')), h('th', { style: { width: '10%' } }, t('player.cols.size')))), body);
}

function card({ name, sub, hue, glyphName, onclick, video: src = null, onmenu = null }) {
  const cover = h('div', { class: 'cover', style: { '--hue': String(hue) } }, src ? h('video', { src: `${src}#t=0.1`, preload: 'metadata', muted: true }) : glyph(glyphName));
  const el = h('button', { class: 'card', type: 'button' }, cover, h('span', { class: 'card-name', title: name }, name), h('span', { class: 'card-sub' }, sub));
  el.addEventListener('click', onclick);
  if (onmenu) el.addEventListener('contextmenu', (e) => (e.preventDefault(), onmenu(e)));
  return el;
}

const countText = (n) => i18n.plural('player.count', n);

function renderHome() {
  const recent = state.recent.map(byPath).filter(Boolean);
  library.replaceChildren(
    head(t('player.nav.home'), actionButton('music', t('player.openDisk'), openFromDisk), actionButton('plus', t('player.openLocal'), openLocal, { accent: true })),
    h('h2', { class: 'section-title' }, t('player.recent')),
    recent.length
      ? h('div', { class: `cards${recent.every((i) => !i.audio) ? ' is-video' : ''}` }, recent.map((item) => card({ name: item.title, sub: item.audio ? artistName(item) : t('player.nav.videos'), hue: hueOf(item.album || item.title), glyphName: item.audio ? 'music' : 'video', video: item.audio ? null : item.url, onclick: () => playList([item]), onmenu: (e) => itemMenu(item, e) })))
      : h('p', { class: 'empty' }, t('player.idle'))
  );
}

function renderSongs() {
  let list = state.songs;
  let title = t('player.nav.songs');
  let playlist = null;
  if (state.filter?.kind === 'artist') {
    list = list.filter((i) => artistName(i) === state.filter.value);
    title = state.filter.value;
  } else if (state.filter?.kind === 'album') {
    list = list.filter((i) => albumName(i) === state.filter.value);
    title = state.filter.value;
  } else if (state.filter?.kind === 'playlist') {
    playlist = state.playlists.find((pl) => pl.id === state.filter.value);
    if (!playlist) return setView('playlists');
    list = playlistItems(playlist);
    title = playlist.name;
  }
  library.replaceChildren(
    head(
      title,
      actionButton('play', t('player.playAll'), () => playList(list), { accent: true }),
      actionButton('shuffle', t('player.shuffleAll'), () => playList(list, 0, { shuffle: true })),
      playlist &&
        actionButton('dismiss', t('player.playlists.delete'), async () => {
          if (!(await confirmDialog(t('player.playlists.deleteTitle'), t('player.playlists.deleteMessage', { name: playlist.name }), { okLabel: t('files.delete'), danger: true }))) return;
          state.playlists = state.playlists.filter((pl) => pl !== playlist);
          savePlaylists();
          setView('playlists');
        })
    ),
    songsTable(list, { playlist })
  );
}

function groupBy(list, key) {
  const groups = new Map();
  for (const item of list) {
    const name = key(item);
    const g = groups.get(name) ?? [];
    g.push(item);
    groups.set(name, g);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], i18n.lang));
}

function renderGroups(kind) {
  const groups = groupBy(state.songs, kind === 'artist' ? artistName : albumName);
  library.replaceChildren(
    head(t(`player.nav.${kind}s`)),
    groups.length ? h('div', { class: 'cards' }, groups.map(([name, items]) => card({ name, sub: countText(items.length), hue: hueOf(name), glyphName: kind === 'artist' ? 'artist' : 'album', onclick: () => setView('songs', { kind, value: name }) }))) : h('p', { class: 'empty' }, t('player.empty'))
  );
}

function renderVideos() {
  library.replaceChildren(
    head(t('player.nav.videos'), actionButton('play', t('player.playAll'), () => playList(state.videos), { accent: true })),
    state.videos.length ? h('div', { class: 'cards is-video' }, state.videos.map((item, i) => card({ name: item.title, sub: formatBytes(item.size), hue: hueOf(item.title), glyphName: 'video', video: item.url, onclick: () => (playList(state.videos, i), setView('now')), onmenu: (e) => itemMenu(item, e) }))) : h('p', { class: 'empty' }, t('player.emptyVideos'))
  );
}

function renderPlaylists() {
  library.replaceChildren(
    head(t('player.nav.playlists'), actionButton('plus', t('player.playlists.new'), () => newPlaylist(), { accent: true })),
    state.playlists.length
      ? h('div', { class: 'cards' }, state.playlists.map((pl) => card({ name: pl.name, sub: countText(playlistItems(pl).length), hue: hueOf(pl.name), glyphName: 'playlist', onclick: () => setView('songs', { kind: 'playlist', value: pl.id }) })))
      : h('p', { class: 'empty' }, t('player.playlists.empty'))
  );
}

/* --------------------------------- now playing ------------------------------- */

function renderPlaying() {
  const item = current();
  // the transport bar
  els.info.replaceChildren();
  if (item) {
    els.info.append(h('div', { class: 'thumb', style: { '--hue': String(hueOf(item.album || item.title)) } }, glyph(item.audio ? 'music' : 'video')), h('div', { class: 'info-text' }, h('span', null, item.title), h('small', null, item.audio ? artistName(item) : t('player.nav.videos'))));
  }
  els.prev.disabled = state.queue.length < 2;
  els.next.disabled = state.queue.length < 2;
  // the big picture of an audio track
  artEl.hidden = !item || !item.audio;
  if (item?.audio) {
    artEl.style.setProperty('--hue', String(hueOf(item.album || item.title)));
    artEl.replaceChildren(h('div', { class: 'art-cover' }, glyph('music')), h('div', { class: 'art-title' }, item.title), h('div', { class: 'art-sub' }, artistName(item)), ...(item.album ? [h('div', { class: 'art-sub' }, item.album)] : []));
  }
  // the queue
  const clear = h('button', { class: 'btn btn-subtle', type: 'button', disabled: !state.queue.length }, t('player.clearQueue'));
  clear.addEventListener('click', clearQueue);
  queueEl.replaceChildren(
    h('div', { class: 'queue-head' }, h('h2', null, t('player.queue')), clear),
    ...(state.queue.length
      ? state.queue.map((q, i) => {
          const remove = h('button', { class: 'mini-btn', type: 'button', 'aria-label': t('player.removeFromQueue'), 'data-tip': t('player.removeFromQueue') }, glyph('dismiss'));
          remove.addEventListener('click', (e) => (e.stopPropagation(), removeFromQueue(i)));
          const row = h('div', { class: `queue-item${i === state.index ? ' is-current' : ''}`, role: 'button', tabIndex: 0 }, h('div', { class: 'queue-text' }, h('span', null, q.title), h('small', null, q.audio ? artistName(q) : t('player.nav.videos'))), remove);
          row.addEventListener('click', () => play(i));
          row.addEventListener('keydown', (e) => e.key === 'Enter' && play(i));
          return row;
        })
      : [h('p', { class: 'empty' }, t('player.queueEmpty'))])
  );
  if (state.view === 'songs') renderSongs();
}

function render() {
  renderNav();
  const now = state.view === 'now';
  library.hidden = now;
  nowEl.hidden = !now && !state.mini;
  player.classList.toggle('is-mini', state.mini);
  if (!now) {
    if (state.view === 'home') renderHome();
    else if (state.view === 'songs') renderSongs();
    else if (state.view === 'artists') renderGroups('artist');
    else if (state.view === 'albums') renderGroups('album');
    else if (state.view === 'videos') renderVideos();
    else if (state.view === 'playlists') renderPlaylists();
  }
  renderPlaying();
}

/* ------------------------------------ controls ------------------------------- */

function labels() {
  setGlyph(els.prev, 'prev', t('player.previous'));
  setGlyph(els.next, 'next', t('player.next'));
  setGlyph(els.full, 'full', t('player.fullscreen'));
  setGlyph(els.mini, 'mini', t('player.miniView'));
  setGlyph(els.more, 'more', t('player.more'));
  syncPlay();
  syncModes();
}

function syncModes() {
  setGlyph(els.shuffle, 'shuffle', t('player.shuffle'));
  els.shuffle.classList.toggle('is-on', state.shuffle);
  setGlyph(els.loop, state.repeat === 'one' ? 'loopOne' : 'loop', t(`player.repeat.${state.repeat}`));
  els.loop.classList.toggle('is-on', state.repeat !== 'off');
  els.mini.classList.toggle('is-on', state.mini);
}

function syncPlay() {
  setGlyph(els.play, video.paused ? 'play' : 'pause', t(video.paused ? 'player.play' : 'player.pause'));
}

function syncVolume() {
  els.mute.replaceChildren(icon(video.muted || video.volume === 0 ? 'volume-mute' : video.volume < 0.34 ? 'volume-1' : video.volume < 0.67 ? 'volume-2' : 'volume-3'));
  els.mute.dataset.tip = t(video.muted ? 'quick.unmute' : 'quick.mute');
  els.volume.value = video.muted ? 0 : video.volume * 100;
  fillSlider(els.volume);
}

function syncTime() {
  const d = video.duration;
  els.elapsed.textContent = clock(video.currentTime);
  els.total.textContent = clock(d);
  if (Number.isFinite(d) && d > 0 && document.activeElement !== els.seek) els.seek.value = (video.currentTime / d) * 1000;
  if (!video.src) els.seek.value = 0;
  fillSlider(els.seek);
}

function toggle() {
  if (!video.src) return state.queue.length ? play(Math.max(0, state.index)) : openFromDisk();
  if (video.paused) video.play().catch(() => {});
  else video.pause();
}

function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else player.requestFullscreen?.().catch(() => {});
}

function cycleRepeat() {
  state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
  video.loop = state.repeat === 'one';
  syncModes();
}

function toggleMini() {
  state.mini = !state.mini;
  render();
  syncModes();
}

els.play.addEventListener('click', toggle);
els.prev.addEventListener('click', () => step(-1));
els.next.addEventListener('click', () => step(1));
els.shuffle.addEventListener('click', () => ((state.shuffle = !state.shuffle), syncModes()));
els.loop.addEventListener('click', cycleRepeat);
els.mini.addEventListener('click', toggleMini);
els.mute.addEventListener('click', () => ((video.muted = !video.muted), syncVolume()));
els.volume.addEventListener('input', () => {
  video.muted = false;
  video.volume = Number(els.volume.value) / 100;
});
els.full.addEventListener('click', fullscreen);
els.more.addEventListener('click', () =>
  os.menu(
    [
      { label: t('player.openDisk'), action: openFromDisk },
      { label: t('player.openLocal'), action: openLocal },
      { separator: true },
      { label: t('player.speed'), items: [0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => ({ label: `${rate}×`, checked: state.speed === rate, radio: true, action: () => ((state.speed = rate), (video.playbackRate = rate)) })) },
      { label: t('player.clearQueue'), disabled: !state.queue.length, action: clearQueue }
    ],
    els.more,
    { placement: 'top-end' }
  )
);
els.seek.addEventListener('input', () => {
  if (Number.isFinite(video.duration)) video.currentTime = (Number(els.seek.value) / 1000) * video.duration;
  fillSlider(els.seek);
});
video.addEventListener('click', toggle);
video.addEventListener('dblclick', fullscreen);
for (const type of ['play', 'pause']) video.addEventListener(type, syncPlay);
video.addEventListener('timeupdate', syncTime);
video.addEventListener('loadedmetadata', syncTime);
video.addEventListener('volumechange', syncVolume);
video.addEventListener('ended', onEnded);
video.addEventListener('error', () => {
  if (video.src && !video.src.endsWith('/index.html') && current()) alertDialog(t('app.name'), t('player.playFailed', { name: current().name }));
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === ' ' || k === 'k') toggle();
  else if (k === 'ArrowRight') video.currentTime += 5;
  else if (k === 'ArrowLeft') video.currentTime -= 5;
  else if (k === 'ArrowUp') video.volume = Math.min(1, video.volume + 0.05);
  else if (k === 'ArrowDown') video.volume = Math.max(0, video.volume - 0.05);
  else if (k === 'm') els.mute.click();
  else if (k === 'f') fullscreen();
  else if (k === 'n') step(1);
  else if (k === 'p') step(-1);
  else if (k === 's') els.shuffle.click();
  else if (k === 'r') cycleRepeat();
  else return;
  e.preventDefault();
});
window.addEventListener('dragover', (e) => e.dataTransfer?.types?.includes('Files') && e.preventDefault());
window.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  addFiles(e.dataTransfer.files);
});
window.addEventListener('pagehide', () => state.blobs.forEach((u) => URL.revokeObjectURL(u)));
os.window.on('args', (args) => {
  const entry = typeof args.path === 'string' && fs.stat(args.path);
  if (entry?.url) {
    playList([fromEntry(entry)]);
    setView('now');
  }
});
fs.on('change', () => {
  scan();
  if (state.view !== 'now') render();
});
i18n.on('change', () => (labels(), syncVolume(), scan(), render()));

scan();
labels();
syncVolume();
syncTime();
render();
const startEntry = typeof os.args.path === 'string' ? fs.stat(os.args.path) : null;
if (startEntry?.url) {
  playList([fromEntry(startEntry)]);
  setView('now');
}
