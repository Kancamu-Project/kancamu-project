import { h, icon } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { TASK_PREVIEW_SHOW_DELAY as SHOW_DELAY, TASK_PREVIEW_HIDE_DELAY as HIDE_DELAY } from '../config/shell.js';

/**
 * Resting the pointer on a running app in the taskbar shows a card for each
 * of its windows (title, close button and a miniature of where the window is).
 * A page of an app cannot be photographed from here, so the miniature is a
 * drawing of the window, not its live picture.
 */
export function createTaskPreview(shell) {
  const { wm, flyouts } = shell;
  const bar = shell.taskbar.el;
  const card = h('div', { class: 'tb-preview', hidden: true });
  document.getElementById('screen').append(card);

  let showTimer = 0;
  let hideTimer = 0;
  let appId = null;
  let anchor = null;

  const hide = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    card.hidden = true;
    appId = null;
    anchor = null;
  };
  const hideSoon = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY);
  };

  /** A small drawing of the window inside the screen. */
  function miniature(win) {
    const area = document.getElementById('windows').getBoundingClientRect();
    const r = win.el.getBoundingClientRect();
    const pct = (value, total) => `${Math.max(0, Math.min(100, (value / total) * 100))}%`;
    return h(
      'div',
      { class: 'tb-thumb', style: { aspectRatio: `${area.width} / ${area.height}` } },
      h(
        'div',
        { class: `tb-thumb-win${win.minimized ? ' is-minimized' : ''}`, style: { left: pct(r.left - area.left, area.width), top: pct(r.top - area.top, area.height), width: pct(r.width, area.width), height: pct(r.height, area.height) } },
        h('div', { class: 'tb-thumb-bar' }),
        h('img', { src: win.app.icon, alt: '', draggable: false })
      )
    );
  }

  function render() {
    const wins = wm.byApp(appId, { here: true });
    if (!wins.length) return hide();
    card.replaceChildren(
      ...wins.map((win) => {
        const close = h('button', { class: 'tb-preview-close', type: 'button', 'aria-label': t('taskbar.closeWindow'), tabIndex: -1 }, icon('dismiss', { size: 10 }));
        close.addEventListener('click', async (e) => {
          e.stopPropagation();
          await wm.requestClose(win.id);
          if (appId) render();
        });
        const item = h(
          'div',
          { class: `tb-preview-item${win.id === wm.activeId ? ' is-active' : ''}`, role: 'button', tabIndex: 0, title: win.title },
          h('div', { class: 'tb-preview-head' }, h('img', { src: win.app.icon, alt: '', draggable: false }), h('span', null, win.title), close),
          miniature(win)
        );
        const go = () => {
          hide();
          wm.activate(win.id);
        };
        item.addEventListener('click', go);
        item.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
        item.addEventListener('auxclick', (e) => e.button === 1 && close.click());
        return item;
      })
    );
    place();
  }

  function place() {
    if (!anchor) return;
    card.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const width = card.offsetWidth;
    card.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
  }

  bar.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const button = e.target.closest?.('.tb-app.is-running');
    if (!button) return;
    clearTimeout(hideTimer);
    if (button === anchor) return;
    clearTimeout(showTimer);
    const open = () => {
      appId = button.dataset.app;
      anchor = button;
      render();
    };
    // moving from one app to the next while a card is showing swaps at once
    if (!card.hidden) open();
    else showTimer = setTimeout(open, SHOW_DELAY);
  });
  bar.addEventListener('pointerout', (e) => {
    if (!e.target.closest?.('.tb-app')) return;
    clearTimeout(showTimer);
    if (!card.hidden) hideSoon();
  });
  bar.addEventListener('pointerdown', hide, true);
  card.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  card.addEventListener('pointerleave', hideSoon);
  wm.on('close', () => !card.hidden && render());
  flyouts.on('change', (name) => name && hide());

  return { hide };
}
