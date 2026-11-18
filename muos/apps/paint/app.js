import { os, t, i18n, fs, settings, h, pickFile, showDialog, promptDialog, alertDialog, describeError, basename, extname, KNOWN_FOLDERS } from 'webos/sdk/app.js';

await os.ready;

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const stack = $('stack');
const surface = $('surface');
const selectionEl = $('selection');

const PALETTE = ['#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4', '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7'];

/** Icon drawings (24 x 24, stroked). */
const SVG = {
  pencil: 'M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5z M14.5 6l3 3',
  brush: 'M18.5 3.5a2 2 0 0 1 2.8 2.8l-8.8 9.2-3-3z M9.5 12.5c-2.5 0-4 1.5-4 4 0 1.5-1 2.5-2.5 3 5 1.5 9.5 0 9.5-4',
  calligraphy: 'M5 19l3-1 9-13-3-2-9 13z M8 18l-1.5-2',
  marker: 'M14 4l6 6-8 8-6-6z M6 12l-2 6 6-2 M10 8l6 6',
  spray: 'M9 11h6v9H9z M10 11V8h4v3 M17 5h.01 M19.5 7h.01 M17 9h.01 M20 4h.01 M21 9h.01 M19 11h.01',
  eraser: 'M7 20h13 M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8.5z',
  fill: 'M12 3l7 7-6 6a2 2 0 0 1-2.8 0L5 10.8a2 2 0 0 1 0-2.8z M5 11h13 M20 15c1 1.3 1.5 2.2 1.5 3a1.5 1.5 0 0 1-3 0c0-.8.5-1.7 1.5-3z',
  picker: 'M15 5l4 4-9 9H6v-4z M13 7l4 4',
  text: 'M5 6V4.5h14V6 M12 4.5V19.5 M9 19.5h6',
  select: 'M5 8V5h3 M11 5h2 M16 5h3v3 M19 11v2 M19 16v3h-3 M13 19h-2 M8 19H5v-3 M5 13v-2',
  zoom: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.5 15.5L20 20 M8 10.5h5 M10.5 8v5',
  crop: 'M7 3v14h14 M3 7h14v14',
  rotate: 'M20 12a8 8 0 1 1-2.5-5.8 M20 4v5h-5',
  resize: 'M4 4h6 M4 4v6 M20 20h-6 M20 20v-6 M4 4l16 16',
  flip: 'M12 3v18 M9 7L3 12l6 5z M15 7l6 5-6 5z',
  invert: 'M12 3a9 9 0 1 0 0 18z M12 3a9 9 0 0 1 0 18',
  line: 'M5 19L19 5',
  rect: 'M5 6h14v12H5z',
  roundrect: 'M8 6h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z',
  ellipse: 'M12 5.5c4.4 0 8 2.9 8 6.5s-3.6 6.5-8 6.5-8-2.9-8-6.5 3.6-6.5 8-6.5z',
  triangle: 'M12 5l8 14H4z',
  diamond: 'M12 4l8 8-8 8-8-8z',
  pentagon: 'M12 4l8 6-3 10H7L4 10z',
  hexagon: 'M8 5h8l4 7-4 7H8l-4-7z',
  arrow: 'M4 10h9V6l7 6-7 6v-4H4z',
  star: 'M12 4l2.4 5 5.6.8-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.6-.8z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  'eye-off': 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M4 4l16 16',
  plus: 'M12 5v14 M5 12h14',
  copy: 'M8 8h11v11H8z M5 16V5h11',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  trash: 'M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13',
  merge: 'M12 4v8 M7 9l5 5 5-5 M5 19h14'
};

const TOOLS = ['pencil', 'eraser', 'fill', 'picker', 'text', 'zoom'];
const BRUSHES = ['brush', 'calligraphy', 'marker', 'spray'];
const SHAPES = ['line', 'rect', 'roundrect', 'ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon', 'arrow', 'star'];
const MAX_SIDE = 4000;
const UNDO_LIMIT = 20;

const state = {
  tool: 'brush', // 'pencil' | 'brush' | 'eraser' | 'fill' | 'picker' | 'text' | 'zoom' | 'select' | 'shape'
  brush: 'brush',
  shape: 'rect',
  outline: 'solid',
  fillMode: 'none',
  size: 4,
  primary: '#000000',
  secondary: '#ffffff',
  path: null,
  dirty: false,
  undo: [],
  redo: [],
  zoom: 1,
  w: 800,
  h: 500,
  layersPanel: true,
  statusBar: true
};

/* ---------------------------------- layers ---------------------------------- */

let layers = []; // bottom to top; { id, name, visible, opacity, canvas, ctx }
let activeIndex = 0;
let canvas = null; // the canvas of the active layer
let ctx = null;
let layerSeq = 0;

function makeLayer(name, w = state.w, hh = state.h, { fill = false } = {}) {
  const el = document.createElement('canvas');
  el.className = 'layer';
  el.width = w;
  el.height = hh;
  const c = el.getContext('2d', { willReadFrequently: true });
  if (fill) {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, hh);
  }
  return { id: ++layerSeq, name, visible: true, opacity: 1, canvas: el, ctx: c };
}

const layerName = () => t('paint.layers.layer', { n: layerSeq + 1 });

function rebuildStack() {
  for (const layer of layers) {
    layer.canvas.hidden = !layer.visible;
    layer.canvas.style.opacity = String(layer.opacity);
  }
  stack.replaceChildren(...layers.map((layer) => layer.canvas), selectionEl, surface);
}

function setActive(index) {
  activeIndex = Math.max(0, Math.min(layers.length - 1, index));
  canvas = layers[activeIndex].canvas;
  ctx = layers[activeIndex].ctx;
  renderLayers();
}

/** Paint a hole: the bottom layer shows the background colour, the others become see-through. */
function eraseRect(x, y, w, hh) {
  if (activeIndex === 0) {
    ctx.fillStyle = state.secondary;
    ctx.fillRect(x, y, w, hh);
  } else {
    ctx.clearRect(x, y, w, hh);
  }
}

/** All visible layers on one canvas. */
function flatten() {
  const out = document.createElement('canvas');
  out.width = state.w;
  out.height = state.h;
  const c = out.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, out.width, out.height);
  for (const layer of layers) {
    if (!layer.visible) continue;
    c.globalAlpha = layer.opacity;
    c.drawImage(layer.canvas, 0, 0);
  }
  return out;
}

function resetDocument(w = 800, hh = 500) {
  state.w = w;
  state.h = hh;
  layerSeq = 0;
  layers = [makeLayer(t('paint.layers.background'), w, hh, { fill: true })];
  state.undo = [];
  state.redo = [];
  rebuildStack();
  setActive(0);
  clearSelection();
  applyZoom();
}

/** New picture in every layer (rotate, flip, crop, resize). `draw` paints the old layer into the new one. */
function transformAll(nw, nh, draw) {
  snapshot();
  layers = layers.map((layer, i) => {
    const next = makeLayer(layer.name, nw, nh, { fill: i === 0 });
    next.id = layer.id;
    next.visible = layer.visible;
    next.opacity = layer.opacity;
    draw(next.ctx, layer.canvas, nw, nh);
    return next;
  });
  state.w = nw;
  state.h = nh;
  rebuildStack();
  setActive(activeIndex);
  clearSelection();
  applyZoom();
  changed(true);
}

/* --------------------------------- selection -------------------------------- */

let sel = null; // { x, y, w, h }
let selDrag = null; // { mode: 'new' | 'move', start, orig, base, lifted }
let clip = null; // ImageData copied with Ctrl+C / Ctrl+X

function showSelection() {
  selectionEl.hidden = !sel;
  if (sel) {
    const z = state.zoom;
    Object.assign(selectionEl.style, { left: `${sel.x * z}px`, top: `${sel.y * z}px`, width: `${sel.w * z}px`, height: `${sel.h * z}px` });
  }
  updateStatus();
}

function clearSelection() {
  sel = null;
  selDrag = null;
  showSelection();
}

const insideSel = (p) => sel && p.x >= sel.x && p.x < sel.x + sel.w && p.y >= sel.y && p.y < sel.y + sel.h;
const clampPoint = (p) => ({ x: Math.min(state.w, Math.max(0, p.x)), y: Math.min(state.h, Math.max(0, p.y)) });

function selectDown(e, p) {
  try {
    surface.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  if (insideSel(p)) {
    snapshot();
    const lifted = ctx.getImageData(sel.x, sel.y, sel.w, sel.h);
    eraseRect(sel.x, sel.y, sel.w, sel.h);
    selDrag = { mode: 'move', start: p, orig: { x: sel.x, y: sel.y }, lifted, base: ctx.getImageData(0, 0, state.w, state.h) };
  } else {
    sel = null;
    selDrag = { mode: 'new', start: clampPoint(p) };
    showSelection();
  }
}

function selectMove(p) {
  if (selDrag.mode === 'new') {
    const q = clampPoint(p);
    sel = { x: Math.min(selDrag.start.x, q.x), y: Math.min(selDrag.start.y, q.y), w: Math.abs(q.x - selDrag.start.x), h: Math.abs(q.y - selDrag.start.y) };
  } else {
    sel.x = Math.round(selDrag.orig.x + p.x - selDrag.start.x);
    sel.y = Math.round(selDrag.orig.y + p.y - selDrag.start.y);
    ctx.putImageData(selDrag.base, 0, 0);
    // putImageData ignores transparency of the pixels it replaces, so the lifted part is drawn over the base
    const tmp = document.createElement('canvas');
    tmp.width = selDrag.lifted.width;
    tmp.height = selDrag.lifted.height;
    tmp.getContext('2d').putImageData(selDrag.lifted, 0, 0);
    ctx.drawImage(tmp, sel.x, sel.y);
  }
  showSelection();
}

function selectUp() {
  const mode = selDrag.mode;
  selDrag = null;
  if (mode === 'new' && sel && (sel.w < 2 || sel.h < 2)) sel = null;
  if (mode === 'move') changed(true);
  showSelection();
}

function deleteSelection() {
  if (!sel) return;
  snapshot();
  eraseRect(sel.x, sel.y, sel.w, sel.h);
  changed(true);
}

function copySelection() {
  if (sel) clip = ctx.getImageData(sel.x, sel.y, sel.w, sel.h);
}

function cutSelection() {
  copySelection();
  deleteSelection();
}

function pasteSelection() {
  if (!clip) return;
  snapshot();
  const tmp = document.createElement('canvas');
  tmp.width = clip.width;
  tmp.height = clip.height;
  tmp.getContext('2d').putImageData(clip, 0, 0);
  ctx.drawImage(tmp, 0, 0);
  sel = { x: 0, y: 0, w: clip.width, h: clip.height };
  setTool('select');
  showSelection();
  changed(true);
}

function selectAll() {
  setTool('select');
  sel = { x: 0, y: 0, w: state.w, h: state.h };
  showSelection();
}

/* ------------------------------ image operations ----------------------------- */

function rotate(kind) {
  const { w, h: hh } = state;
  if (kind === 'right') {
    transformAll(hh, w, (c, src, nw) => (c.translate(nw, 0), c.rotate(Math.PI / 2), c.drawImage(src, 0, 0)));
  } else if (kind === 'left') {
    transformAll(hh, w, (c, src, nw, nh) => (c.translate(0, nh), c.rotate(-Math.PI / 2), c.drawImage(src, 0, 0)));
  } else {
    transformAll(w, hh, (c, src) => (c.translate(w, hh), c.rotate(Math.PI), c.drawImage(src, 0, 0)));
  }
}

function flip(horizontal) {
  const { w, h: hh } = state;
  transformAll(w, hh, (c, src) => {
    if (horizontal) (c.translate(w, 0), c.scale(-1, 1));
    else (c.translate(0, hh), c.scale(1, -1));
    c.drawImage(src, 0, 0);
  });
}

function cropToSelection() {
  if (!sel) return;
  const { x, y, w, h: hh } = sel;
  transformAll(w, hh, (c, src) => c.drawImage(src, -x, -y));
}

function invertColors() {
  snapshot();
  const area = sel ?? { x: 0, y: 0, w: state.w, h: state.h };
  const img = ctx.getImageData(area.x, area.y, area.w, area.h);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 255 - img.data[i];
    img.data[i + 1] = 255 - img.data[i + 1];
    img.data[i + 2] = 255 - img.data[i + 2];
  }
  ctx.putImageData(img, area.x, area.y);
  changed(true);
}

async function resizeCanvas() {
  const width = h('input', { class: 'input', type: 'number', min: 1, max: MAX_SIDE, value: state.w });
  const height = h('input', { class: 'input', type: 'number', min: 1, max: MAX_SIDE, value: state.h });
  const { button } = await showDialog({
    title: t('paint.resizeTitle'),
    content: h('div', { class: 'resize-fields' }, h('label', null, t('paint.width'), width), h('label', null, t('paint.height'), height)),
    buttons: [
      { id: 'ok', label: t('common.ok'), primary: true },
      { id: 'cancel', label: t('common.cancel') }
    ],
    cancelId: 'cancel'
  });
  if (button !== 'ok') return;
  const w = Math.min(MAX_SIDE, Math.max(1, Math.round(Number(width.value))));
  const hh = Math.min(MAX_SIDE, Math.max(1, Math.round(Number(height.value))));
  if (!(w > 0 && hh > 0) || (w === state.w && hh === state.h)) return;
  transformAll(w, hh, (c, src) => c.drawImage(src, 0, 0));
}

function clearCanvas() {
  snapshot();
  eraseRect(0, 0, state.w, state.h);
  changed(true);
}

/* ---------------------------------- text ---------------------------------- */

async function placeText(p, color) {
  const text = await promptDialog(t('paint.textTitle'), t('paint.textPrompt'), { okLabel: t('common.ok') });
  if (!text) return;
  snapshot();
  const size = Math.max(10, state.size * 4);
  ctx.font = `${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.fillText(text, p.x, p.y);
  changed(true);
}

/* ----------------------------- history / title ------------------------------ */

/** Every layer as it is now (with the size, because resizing and rotating can be undone). */
const capture = () => ({
  w: state.w,
  h: state.h,
  active: activeIndex,
  layers: layers.map((layer) => ({ id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity, data: layer.ctx.getImageData(0, 0, state.w, state.h) }))
});

function restore(shot) {
  state.w = shot.w;
  state.h = shot.h;
  layers = shot.layers.map((item) => {
    const layer = makeLayer(item.name, shot.w, shot.h);
    layer.id = item.id;
    layer.visible = item.visible;
    layer.opacity = item.opacity;
    layer.ctx.putImageData(item.data, 0, 0);
    return layer;
  });
  rebuildStack();
  setActive(shot.active);
  clearSelection();
  applyZoom();
}

function snapshot() {
  state.undo.push(capture());
  if (state.undo.length > UNDO_LIMIT) state.undo.shift();
  state.redo = [];
}

function undo() {
  if (!state.undo.length) return;
  state.redo.push(capture());
  restore(state.undo.pop());
  changed(true);
}

function redo() {
  if (!state.redo.length) return;
  state.undo.push(capture());
  restore(state.redo.pop());
  changed(true);
}

function changed(isDirty) {
  state.dirty = isDirty;
  os.window.setDirty(isDirty);
  os.window.setTitle(`${state.dirty ? '*' : ''}${state.path ? basename(state.path) : t('paint.untitled')} - ${t('app.name')}`);
}

/* ----------------------------------- zoom ----------------------------------- */

function applyZoom() {
  stack.style.width = `${Math.round(state.w * state.zoom)}px`;
  stack.style.height = `${Math.round(state.h * state.zoom)}px`;
  stack.classList.toggle('is-pixelated', state.zoom >= 2);
  const percent = Math.round(state.zoom * 100);
  $('zoom').value = String(Math.min(800, Math.max(10, percent)));
  $('zoom-text').textContent = `${percent}%`;
  showSelection();
}

/** Zoom to a factor, keeping the picture point under (clientX, clientY) where it is. */
function zoomTo(value, clientX, clientY) {
  const next = Math.min(8, Math.max(0.1, value));
  if (next === state.zoom) return;
  const before = stack.getBoundingClientRect();
  const cx = clientX ?? before.left + Math.min(before.width, stage.clientWidth) / 2;
  const cy = clientY ?? before.top + Math.min(before.height, stage.clientHeight) / 2;
  const px = (cx - before.left) / state.zoom;
  const py = (cy - before.top) / state.zoom;
  state.zoom = next;
  applyZoom();
  const after = stack.getBoundingClientRect();
  stage.scrollLeft += after.left + px * next - cx;
  stage.scrollTop += after.top + py * next - cy;
}

function zoomFit() {
  const z = Math.min((stage.clientWidth - 48) / state.w, (stage.clientHeight - 48) / state.h, 1);
  state.zoom = Math.max(0.1, z);
  applyZoom();
}

/* --------------------------------- colours ---------------------------------- */

function setColor(which, color) {
  state[which] = color;
  $(which).style.background = color;
  if (which === 'primary') $('custom').value = color;
}

/* ----------------------------------- ribbon ---------------------------------- */

const buttons = new Map(); // 'tool:pencil' ... -> element

function glyph(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${SVG[name]}"/></svg>`;
}

function iconButton(name, label, onclick) {
  const b = h('button', { class: 'tool', type: 'button', 'aria-label': label, 'data-tip': label });
  b.innerHTML = glyph(name);
  b.addEventListener('click', onclick);
  return b;
}

function setTool(tool, extra = {}) {
  Object.assign(state, { tool }, extra);
  if (tool !== 'select') clearSelection();
  stack.dataset.tool = tool;
  refreshRibbon();
  updateStatus();
}

function refreshRibbon() {
  for (const [key, el] of buttons) {
    const [kind, name] = key.split(':');
    const on = (kind === 'tool' && state.tool === name) || (kind === 'brush' && state.tool === 'brush' && state.brush === name) || (kind === 'shape' && state.tool === 'shape' && state.shape === name);
    el.classList.toggle('is-active', on);
  }
  $('crop-btn')?.toggleAttribute('disabled', !sel);
}

function toolLabel() {
  if (state.tool === 'brush') return t(`paint.brushes.${state.brush}`);
  if (state.tool === 'shape') return t(`paint.shapes.${state.shape}`);
  return t(`paint.tools.${state.tool}`);
}

function buildRibbon() {
  buttons.clear();
  const group = (key, ...children) => h('div', { class: 'group' }, h('div', { class: 'group-body' }, ...children), h('div', { class: 'group-label' }, t(`paint.groups.${key}`)));
  const reg = (key, el) => (buttons.set(key, el), el);

  const crop = iconButton('crop', t('paint.crop'), cropToSelection);
  crop.id = 'crop-btn';
  const rotateBtn = iconButton('rotate', t('paint.rotate'), () => {});
  os.dropdown(rotateBtn, () => [
    { label: t('paint.rotateRight'), action: () => rotate('right') },
    { label: t('paint.rotateLeft'), action: () => rotate('left') },
    { label: t('paint.rotate180'), action: () => rotate('half') },
    { separator: true },
    { label: t('paint.flipH'), action: () => flip(true) },
    { label: t('paint.flipV'), action: () => flip(false) }
  ]);
  rotateBtn.classList.add('tool');

  const image = group('image', reg('tool:select', iconButton('select', t('paint.tools.select'), () => setTool('select'))), crop, rotateBtn, iconButton('resize', t('paint.resize'), resizeCanvas));
  const tools = group('tools', h('div', { class: 'grid2' }, TOOLS.map((tool) => reg(`tool:${tool}`, iconButton(tool, t(`paint.tools.${tool}`), () => setTool(tool))))));
  const brushes = group('brushes', h('div', { class: 'grid2' }, BRUSHES.map((brush) => reg(`brush:${brush}`, iconButton(brush, t(`paint.brushes.${brush}`), () => setTool('brush', { brush }))))));

  const select = (id, current, set) => {
    const el = h('select', { class: 'input', id }, ['none', 'solid'].map((value) => h('option', { value, selected: value === current }, t(`paint.style.${value}`))));
    el.addEventListener('change', () => set(el.value));
    return el;
  };
  const shapes = group(
    'shapes',
    h('div', { class: 'shapes-grid' }, SHAPES.map((shape) => reg(`shape:${shape}`, iconButton(shape, t(`paint.shapes.${shape}`), () => setTool('shape', { shape }))))),
    h('div', { class: 'options' }, h('label', null, h('span', null, t('paint.outline')), select('outline', state.outline, (v) => (state.outline = v))), h('label', null, h('span', null, t('paint.fill')), select('fill-mode', state.fillMode, (v) => (state.fillMode = v))))
  );

  const sizeInput = h('input', { class: 'slider', type: 'range', min: 1, max: 40, value: state.size, 'aria-label': t('paint.size') });
  const sizeOut = h('output', null, `${state.size}px`);
  sizeInput.addEventListener('input', () => {
    state.size = Number(sizeInput.value);
    sizeOut.textContent = `${state.size}px`;
  });
  const size = group('size', h('div', { class: 'size-box' }, sizeInput, sizeOut));

  const palette = h('div', { class: 'palette' });
  for (const color of PALETTE) {
    const b = h('button', { class: 'swatch', type: 'button', style: { background: color }, 'aria-label': color });
    b.addEventListener('click', () => setColor('primary', color));
    b.addEventListener('contextmenu', (e) => (e.preventDefault(), setColor('secondary', color)));
    palette.append(b);
  }
  const custom = h('input', { class: 'custom', id: 'custom', type: 'color', value: state.primary, 'data-tip': t('paint.customColor') });
  custom.addEventListener('input', () => setColor('primary', custom.value));
  const colors = group('colors', h('div', { class: 'current' }, h('span', { id: 'primary', style: { background: state.primary } }), h('span', { id: 'secondary', style: { background: state.secondary } })), palette, custom);

  $('ribbon').replaceChildren(image, tools, brushes, shapes, size, colors);
  refreshRibbon();
}

/* ----------------------------------- layers UI ------------------------------- */

function layerGlyph(name, label, onclick, { disabled = false } = {}) {
  const b = iconButton(name, label, onclick);
  b.disabled = disabled;
  return b;
}

function renderLayers() {
  const panel = $('layers-panel');
  panel.hidden = !state.layersPanel;
  if (!state.layersPanel || !layers.length) return;
  const active = layers[activeIndex];
  const head = h('div', { class: 'layers-head' }, h('h2', null, t('paint.layers.title')), layerGlyph('plus', t('paint.layers.add'), addLayer));
  const list = h('div', { class: 'layers-list', role: 'listbox' });
  [...layers].reverse().forEach((layer, k) => {
    const index = layers.length - 1 - k;
    const eye = layerGlyph(layer.visible ? 'eye' : 'eye-off', t('paint.layers.visibility'), (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      layer.canvas.hidden = !layer.visible;
      changed(true);
      renderLayers();
    });
    const row = h('div', { class: `layer-row${index === activeIndex ? ' is-active' : ''}${layer.visible ? '' : ' is-hidden'}`, role: 'option', 'aria-selected': String(index === activeIndex), tabIndex: 0 }, eye, h('span', { class: 'layer-name', title: layer.name }, layer.name));
    row.addEventListener('click', () => setActive(index));
    row.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setActive(index)));
    row.addEventListener('dblclick', async () => {
      const name = await promptDialog(t('paint.layers.rename'), t('paint.layers.renamePrompt'), { okLabel: t('common.ok'), value: layer.name });
      if (name?.trim()) {
        layer.name = name.trim().slice(0, 40);
        changed(true);
        renderLayers();
      }
    });
    list.append(row);
  });
  const opacity = h('input', { class: 'slider', type: 'range', min: 0, max: 100, value: Math.round(active.opacity * 100), 'aria-label': t('paint.layers.opacity') });
  const opacityOut = h('output', null, `${Math.round(active.opacity * 100)}%`);
  opacity.addEventListener('input', () => {
    active.opacity = Number(opacity.value) / 100;
    active.canvas.style.opacity = String(active.opacity);
    opacityOut.textContent = `${opacity.value}%`;
  });
  opacity.addEventListener('change', () => changed(true));
  const foot = h(
    'div',
    { class: 'layers-foot' },
    h('label', { class: 'opacity' }, h('span', null, t('paint.layers.opacity')), opacity, opacityOut),
    h(
      'div',
      { class: 'layer-actions' },
      layerGlyph('copy', t('paint.layers.duplicate'), duplicateLayer),
      layerGlyph('up', t('paint.layers.up'), () => moveLayer(1), { disabled: activeIndex === layers.length - 1 }),
      layerGlyph('down', t('paint.layers.down'), () => moveLayer(-1), { disabled: activeIndex === 0 }),
      layerGlyph('merge', t('paint.layers.mergeDown'), mergeDown, { disabled: activeIndex === 0 }),
      layerGlyph('trash', t('paint.layers.delete'), deleteLayer, { disabled: layers.length < 2 })
    )
  );
  panel.replaceChildren(head, list, foot);
}

function addLayer() {
  snapshot();
  layers.splice(activeIndex + 1, 0, makeLayer(layerName()));
  rebuildStack();
  setActive(activeIndex + 1);
  changed(true);
}

function duplicateLayer() {
  snapshot();
  const copy = makeLayer(t('paint.layers.copyOf', { name: layers[activeIndex].name }));
  copy.ctx.drawImage(canvas, 0, 0);
  copy.opacity = layers[activeIndex].opacity;
  layers.splice(activeIndex + 1, 0, copy);
  rebuildStack();
  setActive(activeIndex + 1);
  changed(true);
}

function moveLayer(delta) {
  const to = activeIndex + delta;
  if (to < 0 || to >= layers.length) return;
  snapshot();
  [layers[activeIndex], layers[to]] = [layers[to], layers[activeIndex]];
  rebuildStack();
  setActive(to);
  changed(true);
}

function mergeDown() {
  if (activeIndex === 0) return;
  snapshot();
  const top = layers[activeIndex];
  const below = layers[activeIndex - 1];
  below.ctx.globalAlpha = top.visible ? top.opacity : 0;
  below.ctx.drawImage(top.canvas, 0, 0);
  below.ctx.globalAlpha = 1;
  layers.splice(activeIndex, 1);
  rebuildStack();
  setActive(activeIndex - 1);
  changed(true);
}

function deleteLayer() {
  if (layers.length < 2) return;
  snapshot();
  layers.splice(activeIndex, 1);
  rebuildStack();
  setActive(Math.min(activeIndex, layers.length - 1));
  changed(true);
}

/* ----------------------------------- drawing --------------------------------- */

function floodFill(x, y, hex) {
  const w = state.w;
  const img = ctx.getImageData(0, 0, w, state.h);
  const px = new Uint32Array(img.data.buffer);
  const c = parseInt(hex.slice(1), 16);
  const target = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16); // ABGR
  const from = px[y * w + x];
  if (from === target) return;
  const todo = [y * w + x];
  while (todo.length) {
    const i = todo.pop();
    if (px[i] !== from) continue;
    let left = i;
    const row = Math.floor(i / w) * w;
    while (left > row && px[left - 1] === from) left--;
    let right = i;
    while (right < row + w - 1 && px[right + 1] === from) right++;
    for (let p = left; p <= right; p++) {
      px[p] = target;
      if (row > 0 && px[p - w] === from) todo.push(p - w);
      if (row + w < px.length && px[p + w] === from) todo.push(p + w);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function pointOf(e) {
  const r = surface.getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left) / state.zoom), y: Math.floor((e.clientY - r.top) / state.zoom) };
}

/** The path of a shape inside the box spanned by two corners. */
function shapePath(c, shape, x0, y0, x1, y1) {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const hh = Math.abs(y1 - y0);
  const poly = (points) => points.forEach(([px, py], i) => (i ? c.lineTo(x + px * w, y + py * hh) : c.moveTo(x + px * w, y + py * hh)));
  c.beginPath();
  switch (shape) {
    case 'line':
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      return;
    case 'rect':
      c.rect(x, y, w, hh);
      return;
    case 'roundrect':
      c.roundRect(x, y, w, hh, Math.min(w, hh) * 0.2);
      return;
    case 'ellipse':
      c.ellipse(x + w / 2, y + hh / 2, w / 2, hh / 2, 0, 0, Math.PI * 2);
      return;
    case 'triangle':
      poly([[0.5, 0], [1, 1], [0, 1]]);
      break;
    case 'diamond':
      poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]);
      break;
    case 'pentagon':
      poly([[0.5, 0], [1, 0.38], [0.81, 1], [0.19, 1], [0, 0.38]]);
      break;
    case 'hexagon':
      poly([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]);
      break;
    case 'arrow':
      poly([[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]]);
      break;
    default:
      poly(Array.from({ length: 10 }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.4 : 1;
        return [0.5 + 0.5 * r * Math.cos(angle), 0.5 + 0.5 * r * Math.sin(angle)];
      }));
  }
  c.closePath();
}

/** The tool that decides how a stroke looks: pencil, eraser or one of the brushes. */
const stroker = () => (state.tool === 'brush' ? state.brush : state.tool);
const FREEHAND = new Set(['pencil', 'eraser', 'brush', 'calligraphy', 'marker', 'spray']);

function prepareStroke(kind, color) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.lineCap = ctx.lineJoin = 'round';
  if (kind === 'eraser') {
    if (activeIndex === 0) ctx.strokeStyle = ctx.fillStyle = state.secondary;
    else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = ctx.fillStyle = '#000';
    }
    ctx.lineWidth = state.size * 2;
    return;
  }
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = kind === 'brush' ? state.size * 2 : kind === 'marker' ? state.size * 3 : kind === 'calligraphy' ? 1.5 : state.size;
}

function spray(p) {
  const radius = state.size * 3;
  for (let i = 0; i < state.size * 4; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    ctx.fillRect(Math.round(p.x + Math.cos(angle) * r), Math.round(p.y + Math.sin(angle) * r), 1, 1);
  }
}

function drawMarker() {
  ctx.putImageData(drag.base, 0, 0);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  const [first, ...rest] = drag.points;
  if (!rest.length) ctx.arc(first.x, first.y, ctx.lineWidth / 2, 0, Math.PI * 2);
  else {
    ctx.moveTo(first.x, first.y);
    for (const q of rest) ctx.lineTo(q.x, q.y);
  }
  if (rest.length) ctx.stroke();
  else ctx.fill();
  ctx.globalAlpha = 1;
}

function strokeTo(kind, p) {
  if (kind === 'marker') {
    drag.points.push(p);
    return drawMarker();
  }
  if (kind === 'spray') {
    spray(p);
    return;
  }
  if (kind === 'calligraphy') {
    const a = drag.last;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y)));
    const s = state.size * 0.7;
    for (let i = 0; i <= steps; i++) {
      const x = a.x + ((p.x - a.x) * i) / steps;
      const y = a.y + ((p.y - a.y) * i) / steps;
      ctx.beginPath();
      ctx.moveTo(x - s, y + s);
      ctx.lineTo(x + s, y - s);
      ctx.stroke();
    }
    return;
  }
  ctx.beginPath();
  ctx.moveTo(drag.last.x, drag.last.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

let drag = null;

surface.addEventListener('pointerdown', (e) => {
  if (e.button > 2) return;
  const color = e.button === 2 ? state.secondary : state.primary;
  const p = pointOf(e);
  if (state.tool === 'zoom') {
    zoomTo(state.zoom * (e.button === 2 ? 0.8 : 1.25), e.clientX, e.clientY);
    return;
  }
  if (state.tool === 'picker') {
    const px = flatten().getContext('2d').getImageData(Math.max(0, p.x), Math.max(0, p.y), 1, 1).data;
    setColor(e.button === 2 ? 'secondary' : 'primary', `#${[px[0], px[1], px[2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`);
    return;
  }
  if (state.tool === 'text') {
    e.preventDefault();
    placeText(p, color);
    return;
  }
  if (state.tool === 'select') return selectDown(e, p);
  if (p.x < 0 || p.y < 0 || p.x >= state.w || p.y >= state.h) return;
  snapshot();
  if (state.tool === 'fill') {
    floodFill(p.x, p.y, color);
    changed(true);
    return;
  }
  surface.setPointerCapture(e.pointerId);
  drag = { color, start: p, last: p, base: ctx.getImageData(0, 0, state.w, state.h), points: [p] };
  if (state.tool === 'shape') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = state.size;
    return;
  }
  const kind = stroker();
  prepareStroke(kind, color);
  if (kind === 'marker') drawMarker();
  else if (kind === 'spray') spray(p);
  else if (kind === 'calligraphy') strokeTo(kind, p);
  else {
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  }
});

surface.addEventListener('pointermove', (e) => {
  const p = pointOf(e);
  updateStatus(p.x, p.y);
  if (selDrag) return selectMove(p);
  if (!drag) return;
  if (state.tool === 'shape') {
    ctx.putImageData(drag.base, 0, 0);
    const other = drag.color === state.primary ? state.secondary : state.primary;
    shapePath(ctx, state.shape, drag.start.x, drag.start.y, p.x, p.y);
    if (state.shape !== 'line' && state.fillMode === 'solid') {
      ctx.fillStyle = state.outline === 'solid' ? other : drag.color;
      ctx.fill();
    }
    if (state.shape === 'line' || state.outline === 'solid') {
      ctx.strokeStyle = drag.color;
      ctx.stroke();
    }
    return;
  }
  const kind = stroker();
  strokeTo(kind, p);
  drag.last = p;
});

const endDrag = () => {
  if (selDrag) return selectUp();
  if (!drag) return;
  drag = null;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  changed(true);
};
surface.addEventListener('pointerup', endDrag);
surface.addEventListener('pointercancel', endDrag);
surface.addEventListener('contextmenu', (e) => e.preventDefault());
surface.addEventListener('pointerleave', () => !drag && updateStatus());
stage.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomTo(state.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY);
  },
  { passive: false }
);

/* ----------------------------------- status ---------------------------------- */

function updateStatus(x, y) {
  $('status').hidden = !state.statusBar;
  $('st-pos').textContent = x == null ? toolLabel() : `${x}, ${y} px`;
  $('st-sel').textContent = sel ? `${sel.w} × ${sel.h} px` : '';
  $('st-size').textContent = `${state.w} × ${state.h} px`;
  refreshRibbon();
}

/* ----------------------------------- files ----------------------------------- */

async function settle() {
  if (!state.dirty) return true;
  const { button } = await showDialog({
    title: t('app.name'),
    message: t('paint.unsaved', { name: state.path ? basename(state.path) : t('paint.untitled') }),
    buttons: [
      { id: 'save', label: t('common.save'), primary: true },
      { id: 'discard', label: t('paint.unsavedDontSave') },
      { id: 'cancel', label: t('common.cancel') }
    ],
    cancelId: 'cancel'
  });
  if (button === 'cancel') return false;
  return button === 'discard' ? true : save();
}

async function newImage() {
  if (!(await settle())) return;
  resetDocument();
  state.path = null;
  changed(false);
  updateStatus();
}

async function loadImage(path) {
  const entry = fs.stat(path);
  if (!entry?.url) return alertDialog(t('paint.openFailed'), t('picker.notFound'));
  // the picture is drawn on a canvas, so it comes as data (the address of a file would taint the canvas)
  const data = await fs.readData(path).catch(() => null);
  if (!data) return alertDialog(t('paint.openFailed'), entry.name);
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    resetDocument(Math.round(img.width * scale), Math.round(img.height * scale));
    ctx.drawImage(img, 0, 0, state.w, state.h);
    state.path = entry.path;
    changed(false);
    zoomFit();
    updateStatus();
  };
  img.onerror = () => alertDialog(t('paint.openFailed'), entry.name);
  img.src = data;
}

async function open() {
  if (!(await settle())) return;
  const path = await pickFile({ mode: 'open', dir: KNOWN_FOLDERS.pictures, filter: (e) => e.url && /^(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(extname(e.name)) });
  if (path) loadImage(path);
}

async function save() {
  if (!state.path) return saveAs();
  return write(state.path);
}

async function saveAs() {
  const path = await pickFile({ mode: 'save', dir: KNOWN_FOLDERS.pictures, defaultName: state.path ? basename(state.path) : `${t('paint.untitled')}.png`, extension: 'png' });
  return path ? write(path) : false;
}

async function write(path) {
  const jpeg = /^jpe?g$/.test(extname(path));
  try {
    const data = flatten().toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.92);
    if (fs.exists(path)) await fs.remove(path);
    state.path = await fs.writeLink(path, data, Math.round(data.length * 0.75));
    changed(false);
    return true;
  } catch (err) {
    alertDialog(t('paint.saveFailed'), describeError(err));
    return false;
  }
}

async function setAsBackground() {
  if ((state.dirty || !state.path) && !(await save())) return;
  settings.set('wallpaper', `file:${state.path}`);
}

/* ----------------------------------- menus ----------------------------------- */

function buildMenubar() {
  const bar = $('menubar');
  bar.replaceChildren();
  const menus = [
    [t('paint.menu.file'), () => [
      { label: t('paint.menu.new'), shortcut: 'Ctrl+N', action: newImage },
      { label: t('paint.menu.open'), shortcut: 'Ctrl+O', action: open },
      { label: t('paint.menu.save'), shortcut: 'Ctrl+S', action: save },
      { label: t('paint.menu.saveAs'), shortcut: 'Ctrl+Shift+S', action: saveAs },
      { separator: true },
      { label: t('files.setBackground'), action: setAsBackground },
      { separator: true },
      { label: t('paint.menu.exit'), action: async () => (await settle()) && os.window.close() }
    ]],
    [t('paint.menu.edit'), () => [
      { label: t('paint.menu.undo'), shortcut: 'Ctrl+Z', disabled: !state.undo.length, action: undo },
      { label: t('paint.menu.redo'), shortcut: 'Ctrl+Y', disabled: !state.redo.length, action: redo },
      { separator: true },
      { label: t('files.cut'), shortcut: 'Ctrl+X', disabled: !sel, action: cutSelection },
      { label: t('files.copy'), shortcut: 'Ctrl+C', disabled: !sel, action: copySelection },
      { label: t('files.paste'), shortcut: 'Ctrl+V', disabled: !clip, action: pasteSelection },
      { label: t('files.delete'), shortcut: 'Del', disabled: !sel, action: deleteSelection },
      { label: t('paint.menu.selectAll'), shortcut: 'Ctrl+A', action: selectAll },
      { separator: true },
      { label: t('paint.clear'), action: clearCanvas }
    ]],
    [t('paint.menu.image'), () => [
      { label: t('paint.crop'), disabled: !sel, action: cropToSelection },
      { label: t('paint.resize'), action: resizeCanvas },
      { separator: true },
      { label: t('paint.rotateRight'), action: () => rotate('right') },
      { label: t('paint.rotateLeft'), action: () => rotate('left') },
      { label: t('paint.rotate180'), action: () => rotate('half') },
      { label: t('paint.flipH'), action: () => flip(true) },
      { label: t('paint.flipV'), action: () => flip(false) },
      { separator: true },
      { label: t('paint.invert'), action: invertColors }
    ]],
    [t('paint.menu.view'), () => [
      { label: t('paint.menu.zoomIn'), shortcut: 'Ctrl++', action: () => zoomTo(state.zoom * 1.25) },
      { label: t('paint.menu.zoomOut'), shortcut: 'Ctrl+-', action: () => zoomTo(state.zoom * 0.8) },
      { label: t('paint.zoom.actual'), shortcut: 'Ctrl+0', action: () => zoomTo(1) },
      { label: t('paint.zoom.fit'), action: zoomFit },
      { separator: true },
      { label: t('paint.layers.title'), checked: state.layersPanel, action: () => ((state.layersPanel = !state.layersPanel), renderLayers()) },
      { label: t('paint.menu.statusBar'), checked: state.statusBar, action: () => ((state.statusBar = !state.statusBar), updateStatus()) }
    ]]
  ];
  for (const [label, items] of menus) {
    const b = h('button', { class: 'menu-btn', type: 'button' }, label);
    os.dropdown(b, items);
    bar.append(b);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
  if (!(e.ctrlKey || e.metaKey)) {
    if (e.key === 'Delete' && sel) {
      e.preventDefault();
      deleteSelection();
    } else if (e.key === 'Escape') clearSelection();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === '+' || k === '=') return (e.preventDefault(), zoomTo(state.zoom * 1.25));
  if (k === '-') return (e.preventDefault(), zoomTo(state.zoom * 0.8));
  if (k === '0') return (e.preventDefault(), zoomTo(1));
  const run = { z: undo, y: redo, s: e.shiftKey ? saveAs : save, o: open, n: newImage, c: copySelection, x: cutSelection, v: pasteSelection, a: selectAll }[k];
  if (run) {
    e.preventDefault();
    run();
  }
});

$('zoom').addEventListener('input', () => zoomTo(Number($('zoom').value) / 100));
$('zoom-in').addEventListener('click', () => zoomTo(state.zoom * 1.25));
$('zoom-out').addEventListener('click', () => zoomTo(state.zoom * 0.8));
$('zoom-fit').addEventListener('click', zoomFit);

function labels() {
  $('zoom-fit').textContent = t('paint.zoom.fit');
  $('zoom-in').setAttribute('aria-label', t('paint.menu.zoomIn'));
  $('zoom-out').setAttribute('aria-label', t('paint.menu.zoomOut'));
  $('zoom').setAttribute('aria-label', t('paint.zoom.title'));
}

os.window.onBeforeClose(settle);
os.window.on('args', async (args) => typeof args.path === 'string' && (await settle()) && loadImage(args.path));
i18n.on('change', () => {
  labels();
  buildRibbon();
  buildMenubar();
  renderLayers();
  changed(state.dirty);
  updateStatus();
});

labels();
buildRibbon();
buildMenubar();
setColor('primary', '#000000');
setColor('secondary', '#ffffff');
resetDocument();
stack.dataset.tool = state.tool;
changed(false);
updateStatus();
if (typeof os.args.path === 'string') loadImage(os.args.path);
