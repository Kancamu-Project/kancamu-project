import { h, icon, iconFromUrl, clamp, rectOf } from '../core/dom.js';
import { MENU_SUBMENU_DELAY, MENU_CLOSE_DELAY } from '../config/shell.js';

/**
 * Context menus and drop-down menus.
 *
 *   const item = await showMenu(items, { x, y });                       // at a point
 *   const item = await showMenu(items, { anchor: rect, placement });    // next to an element
 *
 * Item: { label, icon (name in /icons), iconSrc (URL of a mono SVG), iconUrl (URL of a colour picture),
 *         shortcut, disabled, danger, checked, radio,
 *         items: [...submenu], action() }  or  { separator: true }
 * `checked` (true/false) reserves a check-mark column; `radio` shows a dot.
 * The promise resolves with the chosen item, or null when the menu is dismissed.
 */

let session = null;
let layer = null;

function getLayer() {
  if (!layer || !layer.isConnected) {
    layer = h('div', { class: 'menu-layer' });
    document.body.append(layer);
  }
  return layer;
}

export function isMenuOpen() {
  return session !== null;
}

export function closeMenus(result = null) {
  if (!session) return;
  const s = session;
  session = null;
  s.dispose();
  for (const level of s.levels) {
    level.el.classList.add('is-closing');
    setTimeout(() => level.el.remove(), MENU_CLOSE_DELAY);
  }
  s.resolve(result);
}

export function showMenu(items, options = {}) {
  closeMenus();
  const root = getLayer();
  const returnFocus = options.returnFocus === false ? null : document.activeElement;

  return new Promise((resolve) => {
    const offs = [];
    const listen = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      offs.push(() => target.removeEventListener(type, fn, opts));
    };
    const s = {
      levels: [],
      timer: 0,
      resolve: (result) => {
        if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') {
          try {
            returnFocus.focus({ preventScroll: true });
          } catch {
            /* ignore */
          }
        }
        resolve(result);
      },
      dispose: () => {
        clearTimeout(s.timer);
        offs.forEach((off) => off());
      }
    };
    session = s;

    listen(document, 'pointerdown', (e) => !root.contains(e.target) && closeMenus(), true);
    listen(document, 'keydown', onKeyDown, true);
    listen(document, 'wheel', (e) => !root.contains(e.target) && closeMenus(), { capture: true, passive: true });
    listen(window, 'blur', () => closeMenus());
    listen(window, 'resize', () => closeMenus());

    const first = openLevel(Array.from(items), options);
    first.el.focus({ preventScroll: true });
  });
}

function openLevel(items, pos, parentRow = null) {
  const s = session;
  const el = h('div', { class: 'menu', role: 'menu', tabIndex: -1 });
  const level = { el, rows: [], active: -1, parentRow };
  const list = items.filter(Boolean);
  const hasIcons = list.some((item) => item.icon || item.iconUrl || item.iconSrc);
  const hasChecks = list.some((item) => item.checked !== undefined);

  let lastWasSeparator = true; // never start with, or repeat, a separator
  for (const item of list) {
    if (item.separator) {
      if (!lastWasSeparator) el.append(h('div', { class: 'menu-sep', role: 'separator' }));
      lastWasSeparator = true;
      continue;
    }
    lastWasSeparator = false;
    const row = h('div', {
      class: `menu-item${item.disabled ? ' is-disabled' : ''}${item.danger ? ' is-danger' : ''}`,
      role: 'menuitem',
      'aria-disabled': item.disabled ? 'true' : null
    });
    if (hasChecks) row.append(h('span', { class: 'menu-check' }, item.checked ? icon(item.radio ? 'dot' : 'check') : null));
    if (hasIcons) {
      row.append(
        h(
          'span',
          { class: 'menu-icon' },
          item.iconUrl ? h('img', { src: item.iconUrl, alt: '', draggable: false }) : item.iconSrc ? iconFromUrl(item.iconSrc) : item.icon ? icon(item.icon) : null
        )
      );
    }
    row.append(h('span', { class: 'menu-label' }, item.label));
    if (item.shortcut) row.append(h('span', { class: 'menu-shortcut' }, item.shortcut));
    if (item.items) row.append(h('span', { class: 'menu-arrow' }, icon('chevron-right')));

    const index = level.rows.length;
    row.addEventListener('pointerenter', () => hover(level, index));
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      activate(level, index);
    });
    level.rows.push({ item, row });
    el.append(row);
  }
  if (el.lastElementChild?.classList.contains('menu-sep')) el.lastElementChild.remove();

  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerleave', () => {
    // keep the row that owns an open submenu highlighted
    const deeper = s.levels[s.levels.indexOf(level) + 1];
    setActive(level, deeper ? level.rows.findIndex((r) => r.row === deeper.parentRow) : -1);
  });

  getLayer().append(el);
  place(el, pos);
  s.levels.push(level);
  return level;
}

function place(el, pos) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const m = 6;
  el.style.maxHeight = `${vh - 2 * m}px`;
  if (pos.minWidth) el.style.minWidth = `${pos.minWidth}px`;
  const w = el.offsetWidth;
  const hh = el.offsetHeight;
  // in a right-to-left language menus open towards the left and "start" is the right edge
  const rtl = document.documentElement.dir === 'rtl';
  let x;
  let y;

  if (pos.anchor) {
    const a = pos.anchor;
    const gap = pos.gap ?? 4;
    const [side, align = 'start'] = (pos.placement || 'bottom-start').split('-');
    if (side === 'right') {
      // a submenu: to the side where the text goes on, or to the other one when there is no room
      if (rtl) {
        x = a.left - w + 3;
        if (x < m) x = a.right - 3;
      } else {
        x = a.right - 3;
        if (x + w > vw - m) x = a.left - w + 3;
      }
      y = a.top - 5;
    } else {
      const atEnd = (align === 'end') !== rtl; // "start" and "end" swap sides in a right-to-left page
      x = align === 'center' ? a.left + (a.width - w) / 2 : atEnd ? a.right - w : a.left;
      if (side === 'top') {
        y = a.top - hh - gap;
        if (y < m) y = a.bottom + gap;
      } else {
        y = a.bottom + gap;
        if (y + hh > vh - m && a.top - hh - gap >= m) y = a.top - hh - gap;
      }
    }
  } else {
    x = pos.x ?? 0;
    y = pos.y ?? 0;
    if (rtl) x -= w; // opens to the left of the pointer
    else if (x + w > vw - m) x -= w;
    if (y + hh > vh - m) y -= hh;
  }

  el.style.left = `${Math.round(clamp(x, m, Math.max(m, vw - w - m)))}px`;
  el.style.top = `${Math.round(clamp(y, m, Math.max(m, vh - hh - m)))}px`;
}

function closeDeeperThan(level) {
  const s = session;
  const depth = s.levels.indexOf(level);
  while (s.levels.length > depth + 1) s.levels.pop().el.remove();
}

function setActive(level, index) {
  level.active = index;
  level.rows.forEach((r, i) => r.row.classList.toggle('is-active', i === index));
  if (index >= 0) level.rows[index].row.scrollIntoView({ block: 'nearest' });
}

function openSubmenu(level, index, { selectFirst = false } = {}) {
  const s = session;
  const { item, row } = level.rows[index];
  const deeper = s.levels[s.levels.indexOf(level) + 1];
  if (deeper && deeper.parentRow === row) return deeper;
  closeDeeperThan(level);
  const sub = openLevel(Array.from(item.items), { anchor: rectOf(row), placement: 'right-start' }, row);
  if (selectFirst) move(sub, 1);
  return sub;
}

function hover(level, index) {
  const s = session;
  if (!s) return;
  setActive(level, index);
  // moving into a submenu keeps its parent row highlighted
  const depth = s.levels.indexOf(level);
  if (depth > 0 && level.parentRow) {
    const parent = s.levels[depth - 1];
    setActive(parent, parent.rows.findIndex((r) => r.row === level.parentRow));
  }
  clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    if (session !== s || !s.levels.includes(level)) return;
    const { item } = level.rows[index];
    if (item.items && !item.disabled) openSubmenu(level, index);
    else closeDeeperThan(level);
  }, MENU_SUBMENU_DELAY);
}

function activate(level, index) {
  const entry = level.rows[index];
  if (!entry || entry.item.disabled) return;
  if (entry.item.items) {
    clearTimeout(session.timer);
    openSubmenu(level, index, { selectFirst: true });
    return;
  }
  const { item } = entry;
  closeMenus(item);
  try {
    item.action?.(item);
  } catch (err) {
    console.error('[menu] action failed', err);
  }
}

function move(level, step) {
  const count = level.rows.length;
  if (!count) return;
  let i = level.active;
  for (let n = 0; n < count; n++) {
    i = (i + step + count) % count;
    if (!level.rows[i].item.disabled) return setActive(level, i);
  }
}

function onKeyDown(e) {
  const s = session;
  if (!s) return;
  const level = s.levels[s.levels.length - 1];
  switch (e.key) {
    case 'Escape':
      if (s.levels.length > 1) closeDeeperThan(s.levels[s.levels.length - 2]);
      else closeMenus();
      break;
    case 'ArrowDown':
      move(level, 1);
      break;
    case 'ArrowUp':
      if (level.active < 0) level.active = 0;
      move(level, -1);
      break;
    case 'Home':
      level.active = -1;
      move(level, 1);
      break;
    case 'End':
      level.active = 0;
      move(level, -1);
      break;
    case 'ArrowRight':
      if (level.active >= 0 && level.rows[level.active].item.items) openSubmenu(level, level.active, { selectFirst: true });
      break;
    case 'ArrowLeft':
      if (s.levels.length > 1) closeDeeperThan(s.levels[s.levels.length - 2]);
      break;
    case 'Enter':
    case ' ':
      if (level.active >= 0) activate(level, level.active);
      break;
    case 'Tab':
      closeMenus();
      break;
    default:
      return; // leave other keys alone
  }
  e.preventDefault();
  e.stopPropagation();
}
