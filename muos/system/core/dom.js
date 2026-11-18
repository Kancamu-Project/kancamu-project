import { ROOT } from './paths.js';

/**
 * Create an element.
 *   h('button', { class: 'btn', onclick: fn, dataset: { id: 1 } }, 'Label')
 * Props: class, text, dataset, style (object or string), on<event> handlers,
 * DOM properties, and anything else as an attribute. Null values are skipped.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null) continue;
      if (key === 'class') {
        if (value) el.className = value;
      } else if (key === 'text') {
        if (value !== false) el.textContent = value;
      } else if (key === 'dataset') {
        for (const [k, v] of Object.entries(value)) if (v != null && v !== false) el.dataset[k] = v;
      } else if (key === 'style' && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          if (v == null) continue;
          if (k.startsWith('--')) el.style.setProperty(k, v);
          else el.style[k] = v;
        }
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key.startsWith('aria-')) {
        el.setAttribute(key, String(value));
      } else if (key.startsWith('data-') || key === 'role' || key === 'style' || key === 'for' || key === 'list') {
        if (value !== false) el.setAttribute(key, value === true ? '' : value);
      } else if (key in el) {
        el[key] = value;
      } else if (value !== false) {
        el.setAttribute(key, value === true ? '' : value);
      }
    }
  }
  append(el, children);
  return el;
}

/** Append children; strings become text nodes, null/false are skipped, arrays are flattened. */
export function append(parent, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Icon helpers bound to one folder of SVG files. The OS itself uses /icons
 * (the exports below); every app gets its own set from apps/<app>/icons
 * through the app SDK, so apps never depend on the OS icon folder.
 *
 * `base` is an absolute URL that ends with a slash.
 */
export function makeIcons(base) {
  /** URL of an SVG file in the folder. */
  const iconUrl = (name) => `${base}${name}.svg`;

  /** Point an existing icon element at another glyph. */
  const setIcon = (el, name) => {
    if (el.dataset.icon === name) return el;
    el.dataset.icon = name;
    el.style.setProperty('--icon-src', `url("${iconUrl(name)}")`);
    return el;
  };

  /**
   * Monochrome glyph, painted with the current text colour (the SVG is used
   * as a CSS mask, so it follows the theme automatically).
   */
  const icon = (name, { size, class: className } = {}) => {
    const el = document.createElement('i');
    el.className = className ? `icon ${className}` : 'icon';
    el.setAttribute('aria-hidden', 'true');
    if (size) el.style.setProperty('--icon-size', `${size}px`);
    return setIcon(el, name);
  };

  /** Full-colour picture (folders, files, logo ...). */
  const picture = (name, { size, class: className } = {}) => {
    const el = document.createElement('img');
    el.src = iconUrl(name);
    el.alt = '';
    el.draggable = false;
    if (className) el.className = className;
    if (size) {
      el.width = size;
      el.height = size;
    }
    return el;
  };

  /** Give every `<i class="icon" data-icon="name">` written in HTML its glyph. */
  const hydrateIcons = (root = document) => {
    root.querySelectorAll('i.icon[data-icon]').forEach((el) => {
      el.setAttribute('aria-hidden', 'true');
      el.style.setProperty('--icon-src', `url("${iconUrl(el.dataset.icon)}")`);
    });
  };

  return { iconUrl, setIcon, icon, picture, hydrateIcons };
}

/** Monochrome glyph from any SVG URL (used by menus for icons an app brings along). */
export function iconFromUrl(src, { size, class: className } = {}) {
  const el = document.createElement('i');
  el.className = className ? `icon ${className}` : 'icon';
  el.setAttribute('aria-hidden', 'true');
  if (size) el.style.setProperty('--icon-size', `${size}px`);
  el.style.setProperty('--icon-src', `url("${src}")`);
  return el;
}

/** The OS icon set: /icons. */
export const { iconUrl, setIcon, icon, picture, hydrateIcons } = makeIcons(`${ROOT}icons/`);

/** True for elements where the browser's own editing behaviour must be kept. */
export function isEditable(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

/** Plain-object copy of a DOMRect (safe to hand to another window). */
export function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

/** Paint the filled part of an <input class="slider" type="range">. */
export function fillSlider(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const ratio = max > min ? (Number(input.value) - min) / (max - min) : 0;
  input.style.setProperty('--value', `${clamp(ratio, 0, 1) * 100}%`);
}

/** False when animations are switched off in Settings (or by energy saver). */
export function motionOK() {
  return !document.documentElement.classList.contains('no-animations');
}
