import { os, t, i18n, fs, h, pickFile, showDialog, alertDialog, describeError, join, basename, KNOWN_FOLDERS, readJSON, writeJSON } from 'webos/sdk/app.js';

await os.ready;

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const wrap = $('wrap');
const view = $('view');
const ink = $('ink');

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const GLYPH = {
  snip: `<path ${STROKE} d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M11 9v7l2-1.500 1.500 3 1.500-.8-1.500-3 2.600-.2z" fill="currentColor"/>`,
  pen: `<path ${STROKE} d="M4 20l1-4.500L16.500 4a2.100 2.100 0 0 1 3 3L8 18.500z"/>`,
  highlighter: `<path ${STROKE} d="M14 4l6 6-8 8H8l-4 2 1-4V12zM9 13l4 4"/>`,
  eraser: `<path ${STROKE} d="M7 20h13M5.500 14.500l8-8a2 2 0 0 1 2.800 0l2.200 2.200a2 2 0 0 1 0 2.800L12 18H8.500z"/>`,
  crop: `<path ${STROKE} d="M7 3v14h14M3 7h14v14"/>`,
  undo: `<path ${STROKE} d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 6 6"/>`,
  redo: `<path ${STROKE} d="M15 7l5 5-5 5M20 12H10a6 6 0 0 0-6 6"/>`,
  copy: `<path ${STROKE} d="M8 8h11v12H8zM5 16V4h11"/>`,
  save: `<path ${STROKE} d="M5 4h11l3 3v13H5zM8 4v5h7M8 20v-6h8v6"/>`,
  more: '<circle cx="5" cy="12" r="1.600"/><circle cx="12" cy="12" r="1.600"/><circle cx="19" cy="12" r="1.600"/>',
  fit: `<path ${STROKE} d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`,
  check: `<path ${STROKE} d="M5 12l5 5 9-10"/>`
};

function glyph(name) {
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">${GLYPH[name]}</svg>`;
  return span.firstChild;
}

const MODES = ['rect', 'window', 'full', 'free'];
const DELAYS = [0, 3, 5, 10];
const COLORS = ['#e81123', '#ffd60a', '#16c60c', '#0078d4', '#000000'];
const SIZES = [2, 4, 8];
const FOLDER = join(KNOWN_FOLDERS.pictures, 'Screenshots');

const prefs = { auto: true, mode: 'rect', delay: 0, ...readJSON('snip.prefs', {}) };
const savePrefs = () => {
  try {
    writeJSON('snip.prefs', prefs);
  } catch {
    /* kept for this session */
  }
};

/** The picture being worked on: a canvas, the marks drawn over it, where it was saved, and whether it changed. */
const doc = { base: null, strokes: [], path: null, dirty: false };
const edit = { tool: 'pen', color: COLORS[0], size: 1, zoom: 'fit', undo: [], redo: [], crop: null, drawing: null };

/* --------------------------------- snapshots --------------------------------- */

const snapshot = () => ({ base: doc.base, strokes: doc.strokes.slice() });

function remember() {
  edit.undo.push(snapshot());
  if (edit.undo.length > 50) edit.undo.shift();
  edit.redo = [];
}

function restore(shot) {
  doc.base = shot.base;
  doc.strokes = shot.strokes.slice();
  edit.crop = null;
  draw();
}

function undo() {
  if (!edit.undo.length) return;
  edit.redo.push(snapshot());
  restore(edit.undo.pop());
  markDirty();
}

function redo() {
  if (!edit.redo.length) return;
  edit.undo.push(snapshot());
  restore(edit.redo.pop());
  markDirty();
}

function markDirty(flag = true) {
  doc.dirty = flag;
  os.window.setDirty(flag);
  os.window.setTitle(doc.base ? `${flag ? '*' : ''}${doc.path ? basename(doc.path) : t('snip.untitled')} - ${t('app.name')}` : '');
}

/* ----------------------------------- drawing --------------------------------- */

function paintStroke(c, stroke) {
  const pts = stroke.points;
  c.save();
  c.lineCap = stroke.kind === 'hl' ? 'butt' : 'round';
  c.lineJoin = 'round';
  c.lineWidth = stroke.size;
  c.strokeStyle = stroke.color;
  c.globalAlpha = stroke.kind === 'hl' ? 0.4 : 1;
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) c.lineTo(pts[0].x + 0.01, pts[0].y);
  for (const p of pts.slice(1)) c.lineTo(p.x, p.y);
  c.stroke();
  c.restore();
}

function drawInk() {
  const c = ink.getContext('2d');
  c.clearRect(0, 0, ink.width, ink.height);
  for (const stroke of doc.strokes) paintStroke(c, stroke);
  if (edit.drawing) paintStroke(c, edit.drawing);
  if (edit.crop) {
    const r = edit.crop;
    c.save();
    c.fillStyle = 'rgba(0, 0, 0, .5)';
    c.fillRect(0, 0, ink.width, ink.height);
    c.globalCompositeOperation = 'destination-out';
    c.fillRect(r.x, r.y, r.w, r.h);
    c.restore();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2 / zoomValue();
    c.setLineDash([6 / zoomValue(), 4 / zoomValue()]);
    c.strokeRect(r.x, r.y, r.w, r.h);
  }
}

function zoomValue() {
  if (!doc.base) return 1;
  if (edit.zoom !== 'fit') return edit.zoom;
  return Math.min(1, Math.max(0.05, (stage.clientWidth - 40) / doc.base.width), Math.max(0.05, (stage.clientHeight - 40) / doc.base.height));
}

function draw() {
  const has = !!doc.base;
  $('empty').hidden = has;
  wrap.hidden = !has;
  renderBar();
  if (!has) return;
  const { width, height } = doc.base;
  for (const canvas of [view, ink]) {
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${Math.round(width * zoomValue())}px`;
    canvas.style.height = `${Math.round(height * zoomValue())}px`;
  }
  view.getContext('2d').drawImage(doc.base, 0, 0);
  drawInk();
}

/** The picture with the marks on it. */
function flatten() {
  const out = document.createElement('canvas');
  out.width = doc.base.width;
  out.height = doc.base.height;
  const c = out.getContext('2d');
  c.drawImage(doc.base, 0, 0);
  for (const stroke of doc.strokes) paintStroke(c, stroke);
  return out;
}

/* ----------------------------------- pointer --------------------------------- */

const pointOf = (e) => {
  const r = ink.getBoundingClientRect();
  const z = zoomValue();
  return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
};

const strokeSize = () => SIZES[edit.size] * (edit.tool === 'highlighter' ? 4 : 1);

function hits(stroke, p, radius) {
  return stroke.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= radius + stroke.size / 2);
}

let erasing = false;

ink.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !doc.base) return;
  const p = pointOf(e);
  try {
    ink.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  if (edit.tool === 'pen' || edit.tool === 'highlighter') {
    edit.drawing = { kind: edit.tool === 'pen' ? 'pen' : 'hl', color: edit.color, size: strokeSize(), points: [p] };
  } else if (edit.tool === 'eraser') {
    erasing = false;
    eraseAt(p);
    edit.drawing = { eraser: true };
  } else if (edit.tool === 'crop') {
    edit.crop = { x: p.x, y: p.y, w: 0, h: 0, ax: p.x, ay: p.y };
    edit.drawing = { crop: true };
  }
  drawInk();
});

function eraseAt(p) {
  const radius = 10 / zoomValue() + SIZES[edit.size];
  const keep = doc.strokes.filter((s) => !hits(s, p, radius));
  if (keep.length === doc.strokes.length) return;
  if (!erasing) {
    remember();
    erasing = true;
  }
  doc.strokes = keep;
  markDirty();
}

ink.addEventListener('pointermove', (e) => {
  if (!edit.drawing) return;
  const p = pointOf(e);
  if (edit.drawing.points) edit.drawing.points.push(p);
  else if (edit.drawing.eraser) eraseAt(p);
  else if (edit.drawing.crop && edit.crop) {
    const c = edit.crop;
    c.x = Math.max(0, Math.min(c.ax, p.x));
    c.y = Math.max(0, Math.min(c.ay, p.y));
    c.w = Math.min(doc.base.width, Math.max(c.ax, p.x)) - c.x;
    c.h = Math.min(doc.base.height, Math.max(c.ay, p.y)) - c.y;
  }
  drawInk();
});

function endDraw() {
  const drawing = edit.drawing;
  edit.drawing = null;
  if (drawing?.points) {
    remember();
    doc.strokes.push(drawing);
    markDirty();
  }
  if (drawing?.crop && edit.crop && (edit.crop.w < 4 || edit.crop.h < 4)) edit.crop = null;
  drawInk();
  renderBar();
}
ink.addEventListener('pointerup', endDraw);
ink.addEventListener('pointercancel', endDraw);

function applyCrop() {
  const r = edit.crop;
  if (!r || r.w < 4 || r.h < 4) return;
  remember();
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  const out = document.createElement('canvas');
  out.width = Math.round(r.w);
  out.height = Math.round(r.h);
  out.getContext('2d').drawImage(doc.base, -x, -y);
  doc.strokes = doc.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ x: p.x - x, y: p.y - y })) }));
  doc.base = out;
  edit.crop = null;
  markDirty();
  draw();
}

function cancelCrop() {
  edit.crop = null;
  drawInk();
  renderBar();
}

/* ------------------------------------ files ---------------------------------- */

function stamp() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

async function write(path) {
  try {
    const data = flatten().toDataURL('image/png');
    if (fs.exists(path)) await fs.remove(path);
    doc.path = await fs.writeLink(path, data, Math.round(data.length * 0.75));
    markDirty(false);
    return true;
  } catch (err) {
    alertDialog(t('snip.saveFailed'), describeError(err));
    return false;
  }
}

async function saveAuto() {
  if (!fs.exists(FOLDER)) await fs.mkdir(FOLDER, { recursive: true });
  const name = fs.uniqueName(FOLDER, `${t('snip.fileName')} ${stamp()}.png`);
  return (await write(join(FOLDER, name))) ? doc.path : null;
}

async function saveAs() {
  if (!doc.base) return false;
  if (!fs.exists(FOLDER)) await fs.mkdir(FOLDER, { recursive: true });
  const path = await pickFile({ mode: 'save', dir: FOLDER, defaultName: doc.path ? basename(doc.path) : `${t('snip.fileName')} ${stamp()}.png`, extension: 'png' });
  return path ? write(path) : false;
}

async function save() {
  if (!doc.base) return false;
  return doc.path ? write(doc.path) : saveAs();
}

async function copy() {
  if (!doc.base) return;
  try {
    const blob = await new Promise((resolve) => flatten().toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    flash('copy');
  } catch {
    alertDialog(t('snip.copyFailed'), t('snip.copyFailedMessage'));
  }
}

let flashed = '';
function flash(name) {
  flashed = name;
  renderBar();
  setTimeout(() => {
    flashed = '';
    renderBar();
  }, 1200);
}

function openFile() {
  pickFile({ mode: 'open', dir: FOLDER, filter: (e) => e.url && /^(png|jpe?g|gif|webp|bmp)$/.test(e.ext ?? e.name.split('.').pop().toLowerCase()) }).then(async (path) => {
    const entry = path && fs.stat(path);
    if (!entry?.url) return;
    const data = await fs.readData(entry.path).catch(() => null); // as data, so the picture can be drawn on a canvas
    if (data) load(data, { path: entry.path });
  });
}

async function settle() {
  if (!doc.dirty) return true;
  const { button } = await showDialog({
    title: t('app.name'),
    message: t('snip.unsaved'),
    buttons: [
      { id: 'save', label: t('common.save'), primary: true },
      { id: 'discard', label: t('snip.dontSave') },
      { id: 'cancel', label: t('common.cancel') }
    ],
    cancelId: 'cancel'
  });
  if (button === 'cancel') return false;
  return button === 'discard' ? true : save();
}

/** Show a picture (a data URL or the address of a file). */
function load(src, { path = null, autoSave = false } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      doc.base = canvas;
      doc.strokes = [];
      doc.path = path;
      edit.undo = [];
      edit.redo = [];
      edit.crop = null;
      edit.zoom = 'fit';
      markDirty(false);
      draw();
      if (autoSave && prefs.auto) {
        const saved = await saveAuto();
        if (saved) os.notify({ title: t('snip.savedTitle'), body: basename(saved), onClick: () => os.openPath(FOLDER) });
      } else if (autoSave) markDirty(true);
      resolve(true);
    };
    img.onerror = () => {
      alertDialog(t('snip.openFailed'), '');
      resolve(false);
    };
    img.src = src;
  });
}

/* ----------------------------------- snipping -------------------------------- */

let waiting = false;

async function newSnip() {
  if (waiting) return;
  if (doc.base && !(await settle())) return;
  waiting = true;
  try {
    const result = await os.snip({ mode: prefs.mode, delay: prefs.delay });
    if (result?.image) await load(result.image, { autoSave: true });
  } catch (err) {
    alertDialog(t('snip.title'), t(`snip.errors.${['unsupported', 'denied'].includes(err?.code) ? err.code : 'failed'}`));
  } finally {
    waiting = false;
    renderBar();
  }
}

/* ------------------------------------ toolbar -------------------------------- */

function tool(name, label, extra = {}) {
  const b = h('button', { class: `tbtn${extra.active ? ' is-active' : ''}`, type: 'button', 'aria-label': label, 'data-tip': label, disabled: !!extra.disabled }, glyph(name), extra.text ? h('span', null, extra.text) : null);
  b.addEventListener('click', extra.onclick);
  return b;
}

function renderBar() {
  const bar = $('bar');
  const has = !!doc.base;
  const newBtn = h('button', { class: 'btn btn-accent btn-new', type: 'button', disabled: waiting }, glyph('snip'), t('snip.new'));
  newBtn.addEventListener('click', newSnip);
  const modeBtn = h('button', { class: 'btn combo', type: 'button', 'data-tip': t('snip.mode') }, t(`snip.modes.${prefs.mode}`));
  os.dropdown(modeBtn, () => MODES.map((m) => ({ label: t(`snip.modes.${m}`), checked: prefs.mode === m, radio: true, action: () => ((prefs.mode = m), savePrefs(), renderBar()) })));
  const delayBtn = h('button', { class: 'btn combo', type: 'button', 'data-tip': t('snip.delay') }, t(`snip.delays.${prefs.delay}`));
  os.dropdown(delayBtn, () => DELAYS.map((d) => ({ label: t(`snip.delays.${d}`), checked: prefs.delay === d, radio: true, action: () => ((prefs.delay = d), savePrefs(), renderBar()) })));
  const more = h('button', { class: 'tbtn', type: 'button', 'aria-label': t('snip.more'), 'data-tip': t('snip.more') }, glyph('more'));
  os.dropdown(more, () => [
    { label: t('snip.autoSave'), checked: prefs.auto, action: () => ((prefs.auto = !prefs.auto), savePrefs()) },
    { separator: true },
    { label: t('snip.open'), action: openFile },
    { label: t('snip.saveAs'), disabled: !has, action: saveAs },
    { label: t('snip.openFolder'), action: () => os.openPath(fs.exists(FOLDER) ? FOLDER : KNOWN_FOLDERS.pictures) }
  ]);
  const items = [newBtn, modeBtn, delayBtn];
  if (has) {
    items.push(h('span', { class: 'sep' }));
    for (const [id, name] of [['pen', 'pen'], ['highlighter', 'highlighter'], ['eraser', 'eraser'], ['crop', 'crop']]) {
      items.push(tool(name, t(`snip.tools.${id}`), { active: edit.tool === id, onclick: () => setTool(id) }));
    }
    items.push(h('span', { class: 'sep' }));
    for (const color of COLORS) {
      const b = h('button', { class: `swatch${edit.color === color ? ' is-active' : ''}`, type: 'button', style: { background: color }, 'aria-label': color });
      b.addEventListener('click', () => {
        edit.color = color;
        if (edit.tool !== 'pen' && edit.tool !== 'highlighter') edit.tool = 'pen';
        renderBar();
      });
      items.push(b);
    }
    SIZES.forEach((size, i) => {
      const b = h('button', { class: `size-chip${edit.size === i ? ' is-active' : ''}`, type: 'button', 'aria-label': t(`snip.sizes.${i}`), 'data-tip': t(`snip.sizes.${i}`) }, h('i', { style: { width: `${size + 3}px`, height: `${size + 3}px` } }));
      b.addEventListener('click', () => {
        edit.size = i;
        renderBar();
      });
      items.push(b);
    });
    if (edit.crop && edit.crop.w >= 4) {
      items.push(h('span', { class: 'sep' }), tool('check', t('snip.applyCrop'), { text: t('snip.applyCrop'), onclick: applyCrop }), h('button', { class: 'tbtn', type: 'button', onclick: cancelCrop }, t('common.cancel')));
    }
    items.push(h('span', { class: 'fill' }), tool('undo', t('snip.undo'), { disabled: !edit.undo.length, onclick: undo }), tool('redo', t('snip.redo'), { disabled: !edit.redo.length, onclick: redo }), tool('fit', t(edit.zoom === 'fit' ? 'snip.actual' : 'snip.fit'), { onclick: toggleZoom }), tool('copy', t('snip.copy'), { text: flashed === 'copy' ? t('snip.copied') : null, onclick: copy }), tool('save', t('snip.save'), { onclick: save }));
  } else items.push(h('span', { class: 'fill' }));
  items.push(more);
  bar.replaceChildren(...items);
  renderEmpty();
}

function renderEmpty() {
  const empty = $('empty');
  if (doc.base) return;
  empty.replaceChildren(h('h2', null, t('snip.emptyTitle')), h('p', null, t('snip.emptyMessage')));
}

function setTool(name) {
  edit.tool = name;
  if (name !== 'crop') edit.crop = null;
  stage.dataset.tool = name;
  drawInk();
  renderBar();
}

function toggleZoom() {
  edit.zoom = edit.zoom === 'fit' ? 1 : 'fit';
  draw();
}

/* ------------------------------------ wiring --------------------------------- */

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') (e.preventDefault(), undo());
  else if (mod && key === 'y') (e.preventDefault(), redo());
  else if (mod && key === 's') (e.preventDefault(), e.shiftKey ? saveAs() : save());
  else if (mod && key === 'c' && doc.base) (e.preventDefault(), copy());
  else if (mod && key === 'n') (e.preventDefault(), newSnip());
  else if (e.key === 'Enter' && edit.crop) applyCrop();
  else if (e.key === 'Escape' && edit.crop) cancelCrop();
});
window.addEventListener('resize', () => doc.base && edit.zoom === 'fit' && draw());
os.window.onBeforeClose(settle);
os.window.on('args', (args) => args.snip && newSnip());
i18n.on('change', () => (draw(), markDirty(doc.dirty)));

stage.dataset.tool = edit.tool;
draw();
markDirty(false);
if (os.args.snip) newSnip();
