import { os, t, i18n, fs, settings, h, icon, hydrateIcons, KNOWN_FOLDERS, kindOf, join, dirname, basename, extname, formatBytes, formatDateTime, describeError, alertDialog, confirmDialog, readJSON, writeJSON } from 'webos/sdk/app.js';

await os.ready;

const $ = (id) => document.getElementById(id);
const bar = $('bar');
const content = $('content');
const viewer = $('viewer');
const stage = $('stage');
const image = $('image');
const prevBtn = $('prev');
const nextBtn = $('next');
const film = $('film');
const info = $('info');
const editor = $('editor');

const SLIDE_MS = 4000;

const state = {
  all: [], // every picture of the Pictures folder, newest first
  view: 'gallery', // 'gallery' | 'albums' | 'favorites'
  album: null, // a folder path, or null for everything
  query: '',
  size: 150,
  selection: new Set(), // paths
  index: -1, // position in shown() while the viewer is open
  zoom: 0,
  rotation: 0,
  info: false,
  slideshow: 0,
  favorites: new Set(readJSON('photos.favorites', []))
};

const PICTURES = KNOWN_FOLDERS.pictures;
const isFavorite = (photo) => state.favorites.has(photo.path);

/* ------------------------------------ data ----------------------------------- */

/** Every picture inside the Pictures folder, including subfolders, newest first. */
function scan() {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.list(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.type === 'dir') walk(e.path);
      else if (e.url && kindOf(e) === 'image') out.push(e);
    }
  };
  walk(PICTURES);
  const collator = new Intl.Collator(i18n.lang, { numeric: true, sensitivity: 'base' });
  return out.sort((a, b) => b.mtime - a.mtime || collator.compare(a.name, b.name));
}

/** What the gallery shows with the current tab, album and search. */
function shown() {
  const query = state.query.trim().toLowerCase();
  return state.all.filter((photo) => {
    if (state.view === 'favorites' && !isFavorite(photo)) return false;
    if (state.album && dirname(photo.path).toLowerCase() !== state.album.toLowerCase()) return false;
    return !query || photo.name.toLowerCase().includes(query);
  });
}

const current = () => shown()[state.index] ?? null;

function saveFavorites() {
  try {
    writeJSON('photos.favorites', [...state.favorites]);
  } catch {
    /* the list is kept for this session */
  }
}

function toggleFavorite(photo) {
  if (!photo) return;
  if (state.favorites.has(photo.path)) state.favorites.delete(photo.path);
  else state.favorites.add(photo.path);
  saveFavorites();
  renderAll();
}

function albums() {
  const groups = new Map();
  for (const photo of state.all) {
    const dir = dirname(photo.path);
    const group = groups.get(dir.toLowerCase()) ?? { dir, photos: [] };
    group.photos.push(photo);
    groups.set(dir.toLowerCase(), group);
  }
  return [...groups.values()].sort((a, b) => b.photos[0].mtime - a.photos[0].mtime);
}

const albumName = (dir) => (dir.toLowerCase() === PICTURES.toLowerCase() ? t('photos.picturesFolder') : basename(dir));

/* ---------------------------------- importing -------------------------------- */

async function importPhoto() {
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true });
  input.addEventListener('change', async () => {
    for (const file of input.files) {
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
        const c = h('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
        c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
        const data = c.toDataURL('image/jpeg', 0.85);
        const base = file.name.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Photo';
        await fs.writeLink(join(PICTURES, fs.uniqueName(PICTURES, `${base}.jpg`)), data, Math.round(data.length * 0.75));
      } catch (err) {
        await alertDialog(t('photos.importFailed'), describeError(err));
      }
    }
  });
  input.click();
}

/* ------------------------------------ bar ------------------------------------ */

function button(glyph, label, action, { disabled = false, tip = label, on = false, fav = false } = {}) {
  const b = h('button', { class: `tbtn${on ? ' is-on' : ''}${fav ? ' is-fav' : ''}`, type: 'button', disabled, 'aria-label': tip }, icon(glyph), label ? h('span', null, label) : null);
  b.dataset.tip = tip;
  b.addEventListener('click', action);
  return b;
}

function renderBar() {
  bar.replaceChildren();
  const photo = current();
  if (!editor.hidden && photo) return renderEditBar(photo);
  if (!viewer.hidden && photo) {
    bar.append(
      button('arrow-left', t('photos.back'), closeViewer),
      h('span', { class: 'title' }, `${photo.name}  (${state.index + 1}/${shown().length})`),
      button('play', '', startSlideshow, { tip: `${t('photos.slideshow')} (F5)` }),
      button('plus', '', () => zoom(1.25), { tip: t('photos.zoomIn') }),
      button('dismiss', '', () => zoom(0.8), { tip: t('photos.zoomOut') }),
      button('window', t('photos.fit'), () => ((state.zoom = 0), applyZoom())),
      button('refresh', t('photos.rotate'), () => ((state.rotation = (state.rotation + 90) % 360), applyZoom())),
      button('star', '', () => toggleFavorite(photo), { tip: t(isFavorite(photo) ? 'photos.unfavorite' : 'photos.favorite'), fav: isFavorite(photo) }),
      button('edit', t('photos.editAction'), startEdit),
      button('info', '', toggleInfo, { tip: t('photos.info'), on: state.info }),
      button('picture', '', () => settings.set('wallpaper', `file:${photo.path}`), { tip: t('photos.setBackground') }),
      button('delete', '', () => removePhotos([photo]), { tip: t('files.delete') })
    );
    return;
  }
  if (state.selection.size) {
    const chosen = state.all.filter((p) => state.selection.has(p.path));
    bar.append(
      button('dismiss', '', clearSelection, { tip: t('common.cancel') }),
      h('span', { class: 'title' }, i18n.plural('photos.selected', chosen.length)),
      button('check', t('photos.selectAll'), () => selectAll()),
      button('star', t('photos.favorite'), () => (chosen.forEach((p) => state.favorites.add(p.path)), saveFavorites(), clearSelection())),
      button('picture', t('photos.setBackground'), () => settings.set('wallpaper', `file:${chosen[0].path}`), { disabled: chosen.length !== 1 }),
      button('delete', t('files.delete'), () => removePhotos(chosen))
    );
    return;
  }
  const tab = (view, label) => {
    const b = h('button', { class: `tab${state.view === view && !state.album ? ' is-active' : ''}`, type: 'button', role: 'tab' }, label);
    b.addEventListener('click', () => {
      state.view = view;
      state.album = null;
      renderAll();
    });
    return b;
  };
  if (state.album) {
    bar.append(button('arrow-left', t('photos.tabs.albums'), () => ((state.album = null), (state.view = 'albums'), renderAll())), h('span', { class: 'title' }, `${albumName(state.album)}  ·  ${i18n.plural('photos.count', shown().length)}`));
  } else {
    bar.append(h('div', { class: 'tabs', role: 'tablist' }, tab('gallery', t('photos.tabs.gallery')), tab('albums', t('photos.tabs.albums')), tab('favorites', t('photos.tabs.favorites'))), h('span', { class: 'fill' }));
  }
  if (state.view !== 'albums' || state.album) {
    const input = h('input', { type: 'text', spellcheck: false, autocomplete: 'off', value: state.query, placeholder: t('photos.search'), 'aria-label': t('photos.search') });
    input.addEventListener('input', () => {
      state.query = input.value;
      renderContent();
    });
    const size = h('input', { class: 'slider size-slider', type: 'range', min: 90, max: 260, step: 10, value: state.size, 'aria-label': t('photos.size') });
    size.addEventListener('input', () => {
      state.size = Number(size.value);
      content.style.setProperty('--tile', `${state.size}px`);
    });
    bar.append(h('label', { class: 'search' }, icon('search', { size: 14 }), input), size);
  }
  bar.append(button('plus', t('photos.import'), importPhoto), button('open', '', () => os.openPath(PICTURES), { tip: t('photos.openFolder') }));
}

/* --------------------------------- gallery ---------------------------------- */

function dayLabel(time) {
  const day = (value) => new Date(value).setHours(0, 0, 0, 0);
  const diff = Math.round((day(Date.now()) - day(time)) / 86400000);
  if (diff <= 0) return t('photos.today');
  if (diff === 1) return t('photos.yesterday');
  return i18n.date(time, { dateStyle: 'long' });
}

function thumb(photo, list) {
  const selected = state.selection.has(photo.path);
  const check = h('button', { class: 'check', type: 'button', tabIndex: -1, 'aria-label': t('photos.select') }, selected ? icon('check', { size: 12 }) : null);
  check.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSelect(photo);
  });
  const el = h('button', { class: `thumb${selected ? ' is-selected' : ''}`, type: 'button', 'aria-label': photo.name }, h('img', { src: photo.url, alt: '', loading: 'lazy', draggable: false }), check, isFavorite(photo) ? h('span', { class: 'heart' }, icon('star', { size: 16 })) : null);
  el.dataset.tip = photo.name;
  el.addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey || state.selection.size) return toggleSelect(photo);
    showPhoto(list.indexOf(photo));
  });
  return el;
}

function renderContent() {
  content.classList.toggle('is-selecting', state.selection.size > 0);
  content.style.setProperty('--tile', `${state.size}px`);
  content.replaceChildren();
  if (state.view === 'albums' && !state.album) {
    const list = albums();
    if (!list.length) return content.append(h('p', { class: 'empty' }, t('photos.empty')));
    content.append(
      h(
        'div',
        { class: 'albums' },
        list.map(({ dir, photos }) => {
          const el = h('button', { class: 'album', type: 'button' }, h('div', { class: 'album-cover' }, h('img', { src: photos[0].url, alt: '', loading: 'lazy', draggable: false })), h('span', { class: 'album-name' }, albumName(dir)), h('span', { class: 'album-count' }, i18n.plural('photos.count', photos.length)));
          el.addEventListener('click', () => ((state.album = dir), (state.view = 'gallery'), renderAll()));
          return el;
        })
      )
    );
    return;
  }
  const list = shown();
  if (!list.length) {
    const key = state.query ? 'photos.noResults' : state.view === 'favorites' ? 'photos.emptyFavorites' : 'photos.empty';
    return content.append(h('p', { class: 'empty' }, t(key)));
  }
  let label = '';
  let tiles = null;
  for (const photo of list) {
    const day = dayLabel(photo.mtime);
    if (day !== label) {
      label = day;
      tiles = h('div', { class: 'tiles' });
      content.append(h('section', null, h('h2', { class: 'group-title' }, day), tiles));
    }
    tiles.append(thumb(photo, list));
  }
}

function toggleSelect(photo) {
  if (state.selection.has(photo.path)) state.selection.delete(photo.path);
  else state.selection.add(photo.path);
  renderAll();
}

function selectAll() {
  state.selection = new Set(shown().map((p) => p.path));
  renderAll();
}

function clearSelection() {
  state.selection.clear();
  renderAll();
}

function renderAll() {
  renderBar();
  if (viewer.hidden && editor.hidden) renderContent();
  else if (!viewer.hidden) (renderFilm(), renderInfo());
}

/* ---------------------------------- viewer ---------------------------------- */

function applyZoom() {
  const natural = image.naturalWidth || 1;
  stage.classList.toggle('is-zoomed', state.zoom > 0);
  image.style.width = state.zoom > 0 ? `${natural * state.zoom}px` : '';
  image.style.transform = state.rotation ? `rotate(${state.rotation}deg)` : '';
}

function zoom(factor) {
  const base = state.zoom || Math.min(1, stage.clientWidth / (image.naturalWidth || 1), stage.clientHeight / (image.naturalHeight || 1));
  state.zoom = Math.min(8, Math.max(0.1, base * factor));
  applyZoom();
}

function renderFilm() {
  const list = shown();
  film.hidden = list.length < 2;
  film.replaceChildren(
    ...list.map((photo, i) => {
      const b = h('button', { class: i === state.index ? 'is-current' : '', type: 'button', 'aria-label': photo.name }, h('img', { src: photo.url, alt: '', loading: 'lazy', draggable: false }));
      b.addEventListener('click', () => showPhoto(i));
      return b;
    })
  );
  film.children[state.index]?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function toggleInfo() {
  state.info = !state.info;
  renderInfo();
  renderBar();
}

function renderInfo() {
  info.hidden = !state.info || viewer.hidden;
  const photo = current();
  if (info.hidden || !photo) return;
  const add = (label, value) => [h('dt', null, label), h('dd', null, value)];
  info.replaceChildren(
    h('h2', null, t('photos.info')),
    h(
      'dl',
      { class: 'facts' },
      ...add(t('photos.facts.name'), photo.name),
      ...add(t('photos.facts.location'), dirname(photo.path)),
      ...add(t('photos.facts.type'), (extname(photo.name) || '').toUpperCase()),
      ...add(t('photos.facts.size'), formatBytes(photo.size ?? 0)),
      ...add(t('photos.facts.dimensions'), image.naturalWidth ? `${image.naturalWidth} × ${image.naturalHeight}` : '…'),
      ...add(t('photos.facts.created'), formatDateTime(photo.ctime)),
      ...add(t('photos.facts.modified'), formatDateTime(photo.mtime))
    )
  );
}

function showPhoto(i) {
  const list = shown();
  if (!list.length) return closeViewer();
  state.index = (i + list.length) % list.length;
  state.zoom = 0;
  state.rotation = 0;
  viewer.hidden = false;
  content.hidden = true;
  image.onload = () => (applyZoom(), renderInfo());
  image.src = current().url;
  prevBtn.hidden = nextBtn.hidden = list.length < 2;
  applyZoom();
  renderBar();
  renderFilm();
  renderInfo();
  os.window.setTitle(`${current().name} - ${t('app.name')}`);
}

function closeViewer() {
  stopSlideshow();
  viewer.hidden = true;
  editor.hidden = true;
  content.hidden = false;
  state.index = -1;
  renderAll();
  os.window.setTitle('');
}

/* ---------------------------------- slideshow -------------------------------- */

function startSlideshow() {
  if (!viewer.hidden && shown().length) {
    state.slideshow = setInterval(() => showPhoto(state.index + 1), SLIDE_MS);
    viewer.classList.add('is-slideshow');
    bar.hidden = true;
  }
}

function stopSlideshow() {
  if (!state.slideshow) return false;
  clearInterval(state.slideshow);
  state.slideshow = 0;
  viewer.classList.remove('is-slideshow');
  bar.hidden = false;
  return true;
}

/* ----------------------------------- deleting -------------------------------- */

async function removePhotos(photos) {
  if (!photos.length) return;
  const message = photos.length === 1 ? t('photos.deleteMessage', { name: photos[0].name }) : i18n.plural('photos.deleteMany', photos.length);
  if (!(await confirmDialog(t('photos.deleteTitle'), message, { okLabel: t('files.delete'), danger: true }))) return;
  for (const photo of photos) {
    try {
      await fs.trash(photo.path);
      state.favorites.delete(photo.path);
      state.selection.delete(photo.path);
    } catch (err) {
      alertDialog(t('files.deleteFailed'), describeError(err));
    }
  }
  saveFavorites();
}

/* ------------------------------------ editing -------------------------------- */

const ASPECTS = { original: null, square: 1, wide: 16 / 9, standard: 4 / 3, photo: 3 / 2 };
const FILTERS = { none: '', grayscale: 'grayscale(1)', sepia: 'sepia(.8)', warm: 'sepia(.35) saturate(1.3) hue-rotate(-10deg)', cool: 'hue-rotate(15deg) saturate(1.1) brightness(1.05)', vivid: 'saturate(1.6) contrast(1.1)', fade: 'contrast(.85) brightness(1.1) saturate(.8)', invert: 'invert(1)' };

let edit = null; // { photo, source: Image, rot, flipH, flipV, aspect, brightness, contrast, saturation, filter }

async function startEdit() {
  const photo = current();
  if (!photo) return;
  // the picture is drawn on a canvas, so it comes as data (the address of a file would taint the canvas)
  const data = await fs.readData(photo.path).catch(() => null);
  if (!data) return alertDialog(t('photos.edit.failed'), photo.name);
  const source = new Image();
  source.onload = () => {
    edit = { photo, source, rot: 0, flipH: false, flipV: false, aspect: 'original', brightness: 100, contrast: 100, saturation: 100, filter: 'none' };
    viewer.hidden = true;
    editor.hidden = false;
    renderBar();
    renderEditPanel();
    drawEdit($('preview'), 1400);
  };
  source.onerror = () => alertDialog(t('photos.edit.failed'), photo.name);
  source.src = data;
}

const cssFilter = () => `brightness(${edit.brightness}%) contrast(${edit.contrast}%) saturate(${edit.saturation}%) ${FILTERS[edit.filter]}`.trim();

/** Draw the edited picture on a canvas, at most `max` pixels on the long side. */
function drawEdit(target, max) {
  const { source } = edit;
  const turned = edit.rot % 2 === 1;
  const rw = turned ? source.naturalHeight : source.naturalWidth;
  const rh = turned ? source.naturalWidth : source.naturalHeight;
  // 1) rotate and flip the whole picture
  const full = document.createElement('canvas');
  full.width = rw;
  full.height = rh;
  const f = full.getContext('2d');
  f.translate(rw / 2, rh / 2);
  f.rotate((edit.rot * Math.PI) / 2);
  f.scale(edit.flipH ? -1 : 1, edit.flipV ? -1 : 1);
  f.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
  // 2) crop to the chosen shape (from the middle)
  const ratio = ASPECTS[edit.aspect];
  let cw = rw;
  let ch = rh;
  if (ratio) {
    if (rw / rh > ratio) cw = rh * ratio;
    else ch = rw / ratio;
  }
  const scale = Math.min(1, max / Math.max(cw, ch));
  target.width = Math.max(1, Math.round(cw * scale));
  target.height = Math.max(1, Math.round(ch * scale));
  const c = target.getContext('2d');
  c.filter = cssFilter();
  c.drawImage(full, (rw - cw) / 2, (rh - ch) / 2, cw, ch, 0, 0, target.width, target.height);
  c.filter = 'none';
}

function renderEditBar(photo) {
  bar.append(
    button('arrow-left', t('photos.back'), cancelEdit),
    h('span', { class: 'title' }, `${t('photos.editAction')} - ${photo.name}`),
    button('check', t('photos.edit.save'), () => saveEdit(false)),
    button('plus', t('photos.edit.saveCopy'), () => saveEdit(true)),
    button('dismiss', t('common.cancel'), cancelEdit)
  );
}

function renderEditPanel() {
  const panel = $('edit-panel');
  const redraw = () => drawEdit($('preview'), 1400);
  const chip = (label, active, action) => {
    const b = h('button', { class: `chip${active ? ' is-active' : ''}`, type: 'button' }, label);
    b.addEventListener('click', () => {
      action();
      renderEditPanel();
      redraw();
    });
    return b;
  };
  const slider = (key, label) => {
    const out = h('output', null, `${edit[key]}%`);
    const input = h('input', { class: 'slider', type: 'range', min: 0, max: 200, value: edit[key], 'aria-label': label });
    input.addEventListener('input', () => {
      edit[key] = Number(input.value);
      out.textContent = `${edit[key]}%`;
      redraw();
    });
    return h('label', { class: 'field' }, h('span', null, label, out), input);
  };
  panel.replaceChildren(
    h('h2', null, t('photos.editAction')),
    h('h3', null, t('photos.edit.crop')),
    h('div', { class: 'chips' }, Object.keys(ASPECTS).map((key) => chip(t(`photos.edit.aspect.${key}`), edit.aspect === key, () => (edit.aspect = key)))),
    h('h3', null, t('photos.edit.transform')),
    h(
      'div',
      { class: 'chips' },
      chip(t('photos.edit.rotateLeft'), false, () => (edit.rot = (edit.rot + 3) % 4)),
      chip(t('photos.edit.rotateRight'), false, () => (edit.rot = (edit.rot + 1) % 4)),
      chip(t('photos.edit.flipH'), edit.flipH, () => (edit.flipH = !edit.flipH)),
      chip(t('photos.edit.flipV'), edit.flipV, () => (edit.flipV = !edit.flipV))
    ),
    h('h3', null, t('photos.edit.adjust')),
    slider('brightness', t('photos.edit.brightness')),
    slider('contrast', t('photos.edit.contrast')),
    slider('saturation', t('photos.edit.saturation')),
    h('h3', null, t('photos.edit.filters')),
    h('div', { class: 'chips' }, Object.keys(FILTERS).map((key) => chip(t(`photos.edit.filter.${key}`), edit.filter === key, () => (edit.filter = key)))),
    h('h3', null),
    chip(t('photos.edit.reset'), false, () => Object.assign(edit, { rot: 0, flipH: false, flipV: false, aspect: 'original', brightness: 100, contrast: 100, saturation: 100, filter: 'none' }))
  );
}

function cancelEdit() {
  edit = null;
  editor.hidden = true;
  viewer.hidden = false;
  renderAll();
}

async function saveEdit(copy) {
  if (!edit) return;
  const { photo } = edit;
  try {
    const out = document.createElement('canvas');
    drawEdit(out, 4000);
    const png = extname(photo.name) === 'png';
    const data = out.toDataURL(png ? 'image/png' : 'image/jpeg', 0.92);
    const dir = dirname(photo.path);
    const ext = png ? 'png' : 'jpg';
    let target = photo.path;
    if (copy) {
      const base = basename(photo.path).replace(/\.[^.]*$/, '');
      target = join(dir, fs.uniqueName(dir, `${base} ${t('photos.edit.copySuffix')}.${ext}`));
    } else if (extname(photo.name) !== ext) {
      target = join(dir, `${basename(photo.path).replace(/\.[^.]*$/, '')}.${ext}`);
    }
    if (!copy) await fs.remove(photo.path);
    if (fs.exists(target)) await fs.remove(target);
    const saved = await fs.writeLink(target, data, Math.round(data.length * 0.75));
    if (!copy && state.favorites.delete(photo.path)) (state.favorites.add(saved), saveFavorites());
    edit = null;
    editor.hidden = true;
    viewer.hidden = false;
    state.all = scan();
    const at = shown().findIndex((p) => p.path === saved);
    showPhoto(at >= 0 ? at : 0);
  } catch (err) {
    alertDialog(t('photos.edit.failed'), describeError(err));
  }
}

/* ----------------------------------- wiring ---------------------------------- */

function refresh() {
  const open = current()?.path;
  state.all = scan();
  for (const path of [...state.selection]) if (!state.all.some((p) => p.path === path)) state.selection.delete(path);
  if (!editor.hidden) return;
  if (!viewer.hidden) {
    const i = shown().findIndex((p) => p.path === open);
    if (i >= 0) state.index = i;
    else if (shown().length) return showPhoto(Math.min(state.index, shown().length - 1));
    else return closeViewer();
  }
  renderAll();
}

function openPath(path) {
  state.all = scan();
  state.view = 'gallery';
  state.album = null;
  state.query = '';
  const i = shown().findIndex((p) => p.path.toLowerCase() === String(path).toLowerCase());
  if (!editor.hidden) cancelEdit();
  renderAll();
  if (i >= 0) showPhoto(i);
}

prevBtn.addEventListener('click', () => showPhoto(state.index - 1));
nextBtn.addEventListener('click', () => showPhoto(state.index + 1));
stage.addEventListener('wheel', (e) => e.ctrlKey && (e.preventDefault(), zoom(e.deltaY < 0 ? 1.15 : 0.87)), { passive: false });
stage.addEventListener('dblclick', () => ((state.zoom = state.zoom ? 0 : 1), applyZoom()));
viewer.addEventListener('pointerdown', () => stopSlideshow());
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  if (stopSlideshow()) return e.preventDefault();
  if (!editor.hidden) return e.key === 'Escape' && cancelEdit();
  if (viewer.hidden) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') (e.preventDefault(), selectAll());
    else if (e.key === 'Escape' && state.selection.size) clearSelection();
    else if (e.key === 'Delete' && state.selection.size) removePhotos(state.all.filter((p) => state.selection.has(p.path)));
    return;
  }
  if (e.key === 'ArrowLeft') showPhoto(state.index - 1);
  else if (e.key === 'ArrowRight') showPhoto(state.index + 1);
  else if (e.key === 'Escape') closeViewer();
  else if (e.key === 'Delete') removePhotos([current()].filter(Boolean));
  else if (e.key === 'F5') (e.preventDefault(), startSlideshow());
  else if (e.key.toLowerCase() === 'i') toggleInfo();
  else if (e.key === '+' || e.key === '=') zoom(1.25);
  else if (e.key === '-') zoom(0.8);
});
fs.on('change', refresh);
os.window.on('args', (args) => typeof args.path === 'string' && openPath(args.path));
i18n.on('change', () => {
  state.all = scan();
  renderAll();
  if (edit) renderEditPanel();
});

hydrateIcons(document);
state.all = scan();
renderAll();
if (typeof os.args.path === 'string') openPath(os.args.path);
