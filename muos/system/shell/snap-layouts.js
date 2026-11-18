import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { settings } from '../core/settings.js';
import { SNAP_RECTS } from './window-manager.js';
import { SNAP_PATTERNS as PATTERNS, SNAP_SHOW_DELAY as SHOW_DELAY, SNAP_HIDE_DELAY as HIDE_DELAY } from '../config/shell.js';

/**
 * "Snap layouts": resting the pointer on a window's maximize button opens a
 * small panel of arrangements; choosing a zone snaps the window there.
 */
export function createSnapLayouts(shell) {
  const { wm } = shell;
  const windowsEl = document.getElementById('windows');
  const popup = h('div', { class: 'snap-popup', hidden: true, role: 'dialog' });
  document.getElementById('screen').append(popup);

  let showTimer = 0;
  let hideTimer = 0;
  let target = null; // id of the window the panel belongs to

  const hide = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    popup.hidden = true;
    target = null;
  };
  const hideSoon = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY);
  };

  function build(win) {
    popup.setAttribute('aria-label', t('snap.title'));
    popup.replaceChildren(
      ...PATTERNS.map((zones) =>
        h(
          'div',
          { class: 'snap-pattern' },
          zones.map((name) => {
            const rect = SNAP_RECTS[name];
            const zone = h('button', {
              class: `snap-zone${win.layout === name ? ' is-current' : ''}`,
              type: 'button',
              'aria-label': t('snap.zone'),
              style: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
            });
            zone.addEventListener('click', () => {
              const id = win.id;
              hide();
              wm.setLayout(id, name);
              wm.activate(id);
            });
            return zone;
          })
        )
      )
    );
  }

  function show(button) {
    const win = wm.get(button.closest('.window')?.dataset.id);
    if (!win) return;
    target = win.id;
    build(win);
    popup.hidden = false;
    const rect = button.getBoundingClientRect();
    const width = popup.offsetWidth;
    popup.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
    popup.style.top = `${rect.bottom + 4}px`;
  }

  windowsEl.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || !settings.get('snapLayouts')) return;
    const button = e.target.closest?.('.window-max');
    if (!button) return;
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = setTimeout(() => show(button), SHOW_DELAY);
  });
  windowsEl.addEventListener('pointerout', (e) => {
    if (!e.target.closest?.('.window-max')) return;
    clearTimeout(showTimer);
    if (!popup.hidden) hideSoon();
  });
  windowsEl.addEventListener('pointerdown', hide, true); // a press on any window ends it
  popup.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  popup.addEventListener('pointerleave', hideSoon);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !popup.hidden && hide());
  wm.on('close', (win) => win.id === target && hide());

  return { hide };
}
