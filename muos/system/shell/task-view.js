import { h, icon, clear } from '../core/dom.js';
import { i18n, t } from '../core/i18n.js';
import { showMenu } from '../ui/menu.js';

/**
 * Task View: every window of the current desktop as a card, and the strip of
 * virtual desktops above them (switch, add, remove, move a window).
 */
export function createTaskView(shell) {
  const { wm, flyouts } = shell;
  const strip = h('div', { class: 'tv-desktops', role: 'tablist' });
  const grid = h('div', { class: 'tv-grid' });
  const empty = h('p', { class: 'tv-empty', hidden: true });
  const layer = h('div', { class: 'taskview', hidden: true, role: 'dialog' }, strip, grid, empty);
  document.getElementById('screen').append(layer);

  const isOpen = () => !layer.hidden;

  function close() {
    layer.hidden = true;
  }

  function open() {
    flyouts.close();
    layer.hidden = false;
    render();
    layer.focus({ preventScroll: true });
  }

  const toggle = () => (isOpen() ? close() : open());

  /** Name shown for a desktop: "Desktop 2". */
  const desktopName = (index) => t('taskview.desktop', { n: index + 1 });

  function moveMenu(win, event) {
    const items = [];
    for (let i = 0; i < wm.desktopCount; i++) {
      if (i === win.desktop) continue;
      items.push({ label: desktopName(i), action: () => (wm.moveToDesktop(win.id, i), render()) });
    }
    items.push({ separator: true }, { label: t('taskview.newDesktop'), icon: 'plus', action: () => (wm.moveToDesktop(win.id, wm.addDesktop()), render()) });
    showMenu(
      [
        { label: t('taskview.moveTo'), icon: 'open', items },
        { separator: true },
        { label: t('window.close'), icon: 'dismiss', action: async () => (await wm.requestClose(win.id), render()) }
      ],
      { x: event.clientX, y: event.clientY }
    );
  }

  /** A drawing of the window's place on the screen (a page cannot be photographed from here). */
  function miniature(win) {
    const area = document.getElementById('windows').getBoundingClientRect();
    const r = win.el.getBoundingClientRect();
    const pct = (value, total) => `${Math.max(0, Math.min(100, (value / total) * 100))}%`;
    return h(
      'div',
      { class: 'tb-thumb tv-thumb', style: { aspectRatio: `${area.width} / ${area.height}` } },
      h(
        'div',
        { class: `tb-thumb-win${win.minimized ? ' is-minimized' : ''}`, style: { left: pct(r.left - area.left, area.width), top: pct(r.top - area.top, area.height), width: pct(r.width, area.width), height: pct(r.height, area.height) } },
        h('div', { class: 'tb-thumb-bar' }),
        h('img', { src: win.app.icon, alt: '', draggable: false })
      )
    );
  }

  function renderDesktops() {
    clear(strip);
    for (let i = 0; i < wm.desktopCount; i++) {
      const count = wm.onDesktop(i).length;
      const tab = h(
        'div',
        { class: `tv-desktop${i === wm.desktop ? ' is-current' : ''}`, role: 'tab', 'aria-selected': String(i === wm.desktop), tabIndex: 0 },
        h('span', { class: 'tv-desktop-name' }, desktopName(i)),
        h('span', { class: 'tv-desktop-count' }, i18n.plural('taskview.windows', count))
      );
      if (wm.desktopCount > 1) {
        const remove = h('button', { class: 'tv-desktop-close', type: 'button', 'aria-label': t('taskview.removeDesktop'), 'data-tip': t('taskview.removeDesktop'), tabIndex: -1 }, icon('dismiss', { size: 10 }));
        remove.addEventListener('click', (e) => {
          e.stopPropagation();
          wm.removeDesktop(i);
          render();
        });
        tab.append(remove);
      }
      const choose = () => {
        wm.setDesktop(i);
        render();
      };
      tab.addEventListener('click', choose);
      tab.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), choose()));
      strip.append(tab);
    }
    strip.append(
      h(
        'button',
        {
          class: 'tv-desktop tv-new',
          type: 'button',
          onclick: () => {
            wm.setDesktop(wm.addDesktop());
            render();
          }
        },
        icon('plus', { size: 16 }),
        h('span', { class: 'tv-desktop-name' }, t('taskview.newDesktop'))
      )
    );
  }

  function render() {
    if (!isOpen()) return;
    layer.setAttribute('aria-label', t('taskview.title'));
    renderDesktops();
    clear(grid);
    // most recently used first
    const wins = wm.onDesktop().sort((a, b) => wm.stack.indexOf(b.id) - wm.stack.indexOf(a.id));
    empty.hidden = wins.length > 0;
    empty.textContent = t('taskview.empty');
    for (const win of wins) {
      const closeBtn = h('button', { class: 'tb-preview-close', type: 'button', 'aria-label': t('window.close'), tabIndex: -1 }, icon('dismiss', { size: 10 }));
      closeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await wm.requestClose(win.id);
        render();
      });
      const card = h(
        'div',
        { class: `tv-card${win.id === wm.activeId ? ' is-active' : ''}`, role: 'button', tabIndex: 0, title: win.title },
        h('div', { class: 'tb-preview-head' }, h('img', { src: win.app.icon, alt: '', draggable: false }), h('span', null, win.title), closeBtn),
        miniature(win)
      );
      const go = () => {
        close();
        wm.activate(win.id);
      };
      card.addEventListener('click', go);
      card.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        moveMenu(win, e);
      });
      card.addEventListener('auxclick', (e) => e.button === 1 && closeBtn.click());
      grid.append(card);
    }
  }

  layer.tabIndex = -1;
  // a click on the empty space closes it, like Escape does
  layer.addEventListener('pointerdown', (e) => {
    if (e.target === layer || e.target === grid || e.target === empty) close();
  });
  layer.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      close();
    }
  });
  wm.on('open', render);
  wm.on('close', render);
  wm.on('change', render);
  wm.on('desktop', render);
  flyouts.on('change', (name) => name && close());

  return { open, close, toggle, isOpen };
}
