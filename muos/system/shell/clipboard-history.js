import { h, icon, clear, iconUrl } from '../core/dom.js';
import { settings } from '../core/settings.js';
import { clipboard } from '../core/clipboard.js';
import { relativeTime } from '../core/format.js';
import { readJSON, writeJSON } from '../core/store.js';
import { i18n, t } from '../core/i18n.js';
import { CLIPBOARD_HISTORY_LIMIT as LIMIT, CLIPBOARD_MAX_TEXT as MAX_TEXT, CLIPBOARD_MAX_STORED_IMAGE as MAX_STORED_IMAGE } from '../config/shell.js';
import { CLIPBOARD_QUIET_DELAY } from '../config/shell.js';
import { STORAGE_KEYS } from '../config/storage.js';


/**
 * The clipboard history (Alt+V): the latest texts, pictures and files that
 * were copied, newest first. An item can be pinned, and clicking one puts it
 * back on the clipboard (and pastes text into the window in use).
 */
export function createClipboardHistory(shell) {
  const { flyouts, wm } = shell;

  let items = (readJSON(STORAGE_KEYS.clipboardHistory, []) ?? []).filter((item) => item && ['text', 'image', 'files'].includes(item.kind));
  let seq = 0;
  let quiet = false; // true while the history itself writes to the clipboard

  const el = h('div', { class: 'flyout clip', id: 'clipboard-flyout', tabIndex: -1, role: 'dialog' });
  document.getElementById('flyouts').append(el);

  /* ------------------------------- the list -------------------------------- */

  function persist() {
    const keep = items.filter((item) => item.kind !== 'image' || (item.image?.length ?? 0) <= MAX_STORED_IMAGE);
    try {
      writeJSON(STORAGE_KEYS.clipboardHistory, keep);
    } catch {
      /* the list stays in memory */
    }
  }

  const same = (a, b) => a.kind === b.kind && (a.kind === 'text' ? a.text === b.text : a.kind === 'image' ? a.image === b.image : JSON.stringify(a.paths) === JSON.stringify(b.paths) && a.op === b.op);

  /** Add something that was copied. */
  function add(raw) {
    if (quiet || !settings.get('clipboardHistory') || !raw) return;
    let item = null;
    if (raw.kind === 'text' && typeof raw.text === 'string' && raw.text.trim()) item = { kind: 'text', text: raw.text.slice(0, MAX_TEXT) };
    else if (raw.kind === 'image' && typeof raw.image === 'string' && raw.image.startsWith('data:image/')) item = { kind: 'image', image: raw.image };
    else if (raw.kind === 'files' && Array.isArray(raw.paths) && raw.paths.length) item = { kind: 'files', paths: raw.paths.slice(0, 200), op: raw.op === 'cut' ? 'cut' : 'copy' };
    if (!item) return;
    const known = items.find((other) => same(other, item));
    if (known) {
      known.time = Date.now();
      items = [known, ...items.filter((other) => other !== known)].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
    } else {
      item.id = `${Date.now().toString(36)}-${++seq}`;
      item.time = Date.now();
      item.pinned = false;
      const pinned = items.filter((other) => other.pinned);
      const rest = items.filter((other) => !other.pinned);
      items = [...pinned, item, ...rest].slice(0, pinned.length + LIMIT);
    }
    persist();
    if (el.classList.contains('is-open')) render();
  }

  function remove(item) {
    items = items.filter((other) => other !== item);
    persist();
    render();
  }

  function togglePin(item) {
    item.pinned = !item.pinned;
    items = [...items.filter((other) => other.pinned), ...items.filter((other) => !other.pinned)];
    persist();
    render();
  }

  /** Everything that is not pinned goes. */
  function clearAll() {
    items = items.filter((item) => item.pinned);
    persist();
    render();
  }

  /* ------------------------------ using an item ----------------------------- */

  async function use(item) {
    flyouts.close();
    quiet = true;
    try {
      if (item.kind === 'text') {
        await navigator.clipboard?.writeText(item.text).catch(() => {});
        wm.active?.notify('paste', { text: item.text });
      } else if (item.kind === 'image') {
        const blob = await (await fetch(item.image)).blob();
        await navigator.clipboard?.write([new ClipboardItem({ [blob.type]: blob })]).catch(() => {});
      } else {
        clipboard.set(item.op, item.paths);
      }
    } finally {
      setTimeout(() => (quiet = false), CLIPBOARD_QUIET_DELAY);
    }
  }

  /* -------------------------------- rendering ------------------------------- */

  function preview(item) {
    if (item.kind === 'image') return h('img', { class: 'clip-image', src: item.image, alt: t('clipboard.image'), draggable: false });
    if (item.kind === 'files') {
      const names = item.paths.slice(0, 3).map((path) => path.split('/').pop());
      return h('div', { class: 'clip-files' }, h('img', { src: iconUrl('c-file'), alt: '' }), h('div', null, h('strong', null, `${t(item.op === 'cut' ? 'clipboard.cut' : 'clipboard.copied')} · ${i18n.plural('clipboard.files', item.paths.length)}`), h('span', null, names.join(', ') + (item.paths.length > 3 ? ' …' : ''))));
    }
    return h('div', { class: 'clip-text' }, item.text);
  }

  function render() {
    clear(el);
    el.setAttribute('aria-label', t('clipboard.title'));
    const on = settings.get('clipboardHistory');
    const clearButton = h('button', { class: 'btn btn-subtle clip-clear', type: 'button', disabled: !items.some((item) => !item.pinned) }, t('clipboard.clearAll'));
    clearButton.addEventListener('click', clearAll);
    el.append(h('div', { class: 'clip-head' }, h('h2', null, t('clipboard.title')), clearButton));
    if (!on) {
      const turnOn = h('button', { class: 'btn btn-accent', type: 'button' }, t('clipboard.turnOn'));
      turnOn.addEventListener('click', () => (settings.set('clipboardHistory', true), render()));
      el.append(h('div', { class: 'clip-empty' }, h('p', null, t('clipboard.off')), turnOn));
      if (!items.length) return;
    }
    const list = h('div', { class: 'clip-list' });
    if (on && !items.length) list.append(h('p', { class: 'clip-empty' }, t('clipboard.empty')));
    for (const item of items) {
      const pin = h('button', { class: `clip-act${item.pinned ? ' is-on' : ''}`, type: 'button', 'aria-label': t(item.pinned ? 'clipboard.unpin' : 'clipboard.pin'), 'data-tip': t(item.pinned ? 'clipboard.unpin' : 'clipboard.pin') }, icon('pin', { size: 14 }));
      const del = h('button', { class: 'clip-act', type: 'button', 'aria-label': t('clipboard.delete'), 'data-tip': t('clipboard.delete') }, icon('dismiss', { size: 12 }));
      pin.addEventListener('click', (e) => (e.stopPropagation(), togglePin(item)));
      del.addEventListener('click', (e) => (e.stopPropagation(), remove(item)));
      const card = h('div', { class: `clip-item${item.pinned ? ' is-pinned' : ''}`, role: 'button', tabIndex: 0 }, preview(item), h('div', { class: 'clip-foot' }, h('span', null, relativeTime(item.time)), h('span', { class: 'clip-acts' }, pin, del)));
      card.addEventListener('click', () => use(item));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') use(item);
        else if (e.key === 'Delete') remove(item);
      });
      list.append(card);
    }
    el.append(list);
  }

  /* --------------------------------- wiring -------------------------------- */

  el.addEventListener('contextmenu', (e) => e.preventDefault());
  flyouts.register('clipboard', {
    el,
    onOpen() {
      render();
      (el.querySelector('.clip-item') ?? el).focus({ preventScroll: true });
    }
  });
  // files copied in File Explorer or on the desktop
  clipboard.on('change', () => {
    const data = clipboard.get();
    if (data) add({ kind: 'files', paths: data.paths, op: data.op });
  });
  i18n.on('change', () => el.classList.contains('is-open') && render());

  return {
    add,
    /** Everything that is not pinned goes (Settings). */
    clear: clearAll,
    get count() {
      return items.length;
    }
  };
}
