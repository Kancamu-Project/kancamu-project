import { h, icon, picture, clear, rectOf } from '../core/dom.js';
import { settings } from '../core/settings.js';
import { apps } from '../core/apps.js';
import { fs, HOME } from '../core/fs.js';
import { iconFor } from '../core/filetypes.js';
import { relativeTime } from '../core/format.js';
import { i18n, t } from '../core/i18n.js';
import { showMenu } from '../ui/menu.js';
import { uninstallApp } from './uninstall.js';

/** The Start menu: pinned apps, recommended files, all apps, user and power. */
export function createStartMenu(shell) {
  const { flyouts } = shell;

  const pinnedGrid = h('div', { class: 'start-grid' });
  const recoList = h('div', { class: 'start-reco' });
  const recoSection = h('section', { class: 'start-section' }, h('div', { class: 'start-head' }, h('h2', { 'data-i18n': 'start.recommended' }), h('button', { class: 'start-pill', type: 'button', onclick: () => run(() => shell.openLocation(HOME)) }, h('span', { 'data-i18n': 'start.more' }), icon('chevron-right', { size: 12 }))), recoList);
  const mainView = h(
    'div',
    { class: 'start-view' },
    h(
      'section',
      { class: 'start-section' },
      h(
        'div',
        { class: 'start-head' },
        h('h2', { 'data-i18n': 'start.pinned' }),
        h('button', { class: 'start-pill', type: 'button', onclick: () => setView('all') }, h('span', { 'data-i18n': 'start.allApps' }), icon('chevron-right', { size: 12 }))
      ),
      pinnedGrid
    ),
    recoSection
  );

  const allList = h('div', { class: 'start-all' });
  const allView = h(
    'div',
    { class: 'start-view', hidden: true },
    h(
      'div',
      { class: 'start-head' },
      h('h2', { 'data-i18n': 'start.allApps' }),
      h('button', { class: 'start-pill', type: 'button', onclick: () => setView('main') }, icon('chevron-left', { size: 12 }), h('span', { 'data-i18n': 'start.back' }))
    ),
    allList
  );

  const userName = h('span', { class: 'start-user-name' });
  const userBtn = h('button', { class: 'start-user', type: 'button', onclick: userMenu }, picture('avatar', { size: 32, class: 'avatar' }), userName);
  const powerBtn = h('button', { class: 'start-power', type: 'button', onclick: powerMenu }, icon('power', { size: 18 }));

  // typing in the box hands over to the Search panel, which has the results
  const searchInput = h('input', { class: 'start-search-input', type: 'text', spellcheck: false, autocomplete: 'off', 'data-i18n-placeholder': 'start.searchPlaceholder' });
  searchInput.addEventListener('input', () => {
    const query = searchInput.value;
    searchInput.value = '';
    flyouts.open('search', { query });
  });
  searchInput.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), flyouts.open('search')));
  const searchBox = h('label', { class: 'start-search' }, icon('search', { size: 16 }), searchInput);

  const el = h(
    'div',
    { class: 'flyout start', id: 'start-menu', tabIndex: -1, role: 'dialog' },
    searchBox,
    h('div', { class: 'start-body' }, mainView, allView),
    h('div', { class: 'start-footer' }, userBtn, powerBtn)
  );
  document.getElementById('flyouts').append(el);

  /* -------------------------------- actions ------------------------------- */

  function run(action) {
    flyouts.close();
    action();
  }

  function setView(name) {
    mainView.hidden = name !== 'main';
    allView.hidden = name !== 'all';
    el.focus({ preventScroll: true });
  }

  function appMenu(app, event) {
    event.preventDefault();
    const inStart = apps.isPinned('start', app.id);
    const inTaskbar = apps.isPinned('taskbar', app.id);
    showMenu(
      [
        { label: t('start.open'), icon: 'open', action: () => run(() => shell.launch(app.id)) },
        { separator: true },
        { label: t(inStart ? 'start.unpinStart' : 'start.pinStart'), icon: inStart ? 'pin-off' : 'pin', action: () => apps.setPinned('start', app.id, !inStart) },
        { label: t(inTaskbar ? 'taskbar.unpin' : 'taskbar.pin'), icon: inTaskbar ? 'pin-off' : 'pin', action: () => apps.setPinned('taskbar', app.id, !inTaskbar) },
        apps.isRemovable(app.id) && { separator: true },
        apps.isRemovable(app.id) && { label: t('uninstall.action'), icon: 'delete', danger: true, action: () => uninstallApp(app) }
      ],
      { x: event.clientX, y: event.clientY }
    );
  }

  function userMenu() {
    const settingsApp = apps.byRole('settings');
    showMenu(
      [
        settingsApp && { label: t('start.accountSettings'), icon: 'user', action: () => run(() => shell.launch(settingsApp.id, { page: 'accounts' })) },
        { separator: true },
        { label: t('power.lock'), icon: 'lock', action: () => run(() => shell.power.lock()) },
        { label: t('power.signOut'), icon: 'sign-out', action: () => run(() => shell.power.signOut()) }
      ],
      { anchor: rectOf(userBtn), placement: 'top-start', gap: 8 }
    );
  }

  function powerMenu() {
    showMenu(
      [
        { label: t('power.sleep'), icon: 'moon', action: () => run(() => shell.power.sleep()) },
        { label: t('power.shutDown'), icon: 'power', action: () => run(() => shell.power.shutDown()) },
        { label: t('power.restart'), icon: 'refresh', action: () => run(() => shell.power.restart()) }
      ],
      { anchor: rectOf(powerBtn), placement: 'top-end', gap: 8 }
    );
  }

  /* ------------------------------- rendering ------------------------------ */

  function renderPinned() {
    clear(pinnedGrid);
    const pinned = apps.pinnedTo('start');
    if (!pinned.length) {
      pinnedGrid.append(h('p', { class: 'start-empty' }, t('start.noPinned')));
      return;
    }
    for (const id of pinned) {
      const app = apps.get(id);
      const tile = h(
        'button',
        { class: 'start-tile', type: 'button', onclick: () => run(() => shell.launch(app.id)) },
        h('img', { src: app.icon, alt: '', draggable: false }),
        h('span', { class: 'start-tile-label' }, apps.name(app))
      );
      tile.addEventListener('contextmenu', (e) => appMenu(app, e));
      pinnedGrid.append(tile);
    }
  }

  function renderRecommended() {
    recoSection.hidden = !settings.get('startRecommended');
    if (recoSection.hidden) return;
    clear(recoList);
    const recent = fs.recent(HOME, 6);
    if (!recent.length) {
      recoList.append(h('p', { class: 'start-empty' }, t('start.noRecommended')));
      return;
    }
    for (const entry of recent) {
      recoList.append(
        h(
          'button',
          { class: 'start-reco-item', type: 'button', onclick: () => run(() => shell.openPath(entry.path)) },
          h('img', { src: iconFor(entry, { thumbnail: true }), alt: '', draggable: false }),
          h('span', { class: 'start-reco-text' }, h('span', { class: 'start-reco-name' }, entry.name), h('span', { class: 'start-reco-meta' }, relativeTime(entry.mtime)))
        )
      );
    }
  }

  function renderAll() {
    clear(allList);
    let letter = '';
    for (const app of apps.sorted()) {
      const name = apps.name(app);
      const first = name.charAt(0).toLocaleUpperCase(i18n.lang);
      if (first !== letter) {
        letter = first;
        allList.append(h('div', { class: 'start-letter' }, letter));
      }
      const row = h(
        'button',
        { class: 'start-row', type: 'button', onclick: () => run(() => shell.launch(app.id)) },
        h('img', { src: app.icon, alt: '', draggable: false }),
        h('span', null, name)
      );
      row.addEventListener('contextmenu', (e) => appMenu(app, e));
      allList.append(row);
    }
  }

  function render() {
    i18n.apply(el);
    userName.textContent = settings.get('userName');
    userBtn.dataset.tip = settings.get('userName');
    powerBtn.dataset.tip = t('power.title');
    powerBtn.setAttribute('aria-label', t('power.title'));
    renderPinned();
    renderRecommended();
    renderAll();
  }

  /* -------------------------------- wiring -------------------------------- */

  // typing while Start is open jumps to Search, like on the real thing
  el.addEventListener('keydown', (e) => {
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      flyouts.open('search', { query: e.key });
    }
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  flyouts.register('start', {
    el,
    onOpen() {
      render();
      setView('main');
      searchInput.focus({ preventScroll: true }); // Start opens with the cursor in the search box, as a Mac's Spotlight does
    }
  });

  settings.on('change', (key) => {
    if (['startPinned', 'taskbarPinned', 'startRecommended', 'userName', 'appInstall'].includes(key)) render();
  });
  i18n.on('change', render);
  render();

  return { el };
}
