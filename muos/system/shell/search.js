import { h, icon, iconUrl, clear } from '../core/dom.js';
import { apps } from '../core/apps.js';
import { fs, HOME, dirname } from '../core/fs.js';
import { iconFor } from '../core/filetypes.js';
import { i18n, t } from '../core/i18n.js';

/** Search panel: finds apps, settings pages and files of the virtual disk. */
export function createSearch(shell) {
  const { flyouts } = shell;

  const input = h('input', { class: 'search-input', type: 'text', spellcheck: false, autocomplete: 'off', 'data-i18n-placeholder': 'search.placeholder' });
  const results = h('div', { class: 'search-results' });
  const el = h('div', { class: 'flyout search', id: 'search-panel', role: 'dialog' }, h('label', { class: 'search-box' }, icon('search', { size: 18 }), input), results);
  document.getElementById('flyouts').append(el);

  let rows = []; // { el, run }
  let active = -1;

  const run = (action) => () => {
    flyouts.close();
    action();
  };

  function appResults(query) {
    return apps
      .sorted()
      .filter((app) => !query || apps.name(app).toLowerCase().includes(query) || app.id.includes(query))
      .map((app) => ({ title: apps.name(app), subtitle: t('search.app'), iconUrl: app.icon, run: run(() => shell.launch(app.id)) }));
  }

  function settingsResults(query) {
    const out = [];
    for (const app of apps.list) {
      for (const link of app.deepLinks) {
        const title = apps.linkTitle(link);
        if (title.toLowerCase().includes(query)) {
          out.push({ title, subtitle: apps.name(app), iconUrl: app.icon, run: run(() => shell.launch(app.id, link.args || {})) });
        }
      }
    }
    return out.slice(0, 6);
  }

  function fileResults(query) {
    return fs.search(HOME, query, { limit: 8 }).map((entry) => ({
      title: entry.name,
      subtitle: dirname(entry.path),
      iconUrl: iconFor(entry, { thumbnail: true }),
      run: run(() => shell.openPath(entry.path))
    }));
  }

  function recentResults() {
    return fs.recent(HOME, 5).map((entry) => ({
      title: entry.name,
      subtitle: dirname(entry.path),
      iconUrl: iconFor(entry, { thumbnail: true }),
      run: run(() => shell.openPath(entry.path))
    }));
  }

  function group(title, list) {
    if (!list.length) return;
    results.append(h('h3', { class: 'search-group' }, title));
    for (const item of list) {
      const index = rows.length;
      const row = h(
        'button',
        { class: 'search-row', type: 'button', tabIndex: -1, onclick: item.run },
        h('img', { src: item.iconUrl || iconUrl('c-file'), alt: '', draggable: false }),
        h('span', { class: 'search-row-text' }, h('span', { class: 'search-row-title' }, item.title), h('span', { class: 'search-row-sub' }, item.subtitle))
      );
      row.addEventListener('pointermove', () => setActive(index, false));
      rows.push({ el: row, run: item.run });
      results.append(row);
    }
  }

  function setActive(index, scroll = true) {
    active = index;
    rows.forEach((row, i) => row.el.classList.toggle('is-active', i === index));
    if (scroll && index >= 0) rows[index].el.scrollIntoView({ block: 'nearest' });
  }

  function render() {
    const query = input.value.trim().toLowerCase();
    rows = [];
    clear(results);
    if (!query) {
      group(t('search.apps'), appResults(''));
      group(t('search.recent'), recentResults());
      setActive(-1, false);
    } else {
      group(t('search.apps'), appResults(query));
      group(t('search.settings'), settingsResults(query));
      group(t('search.files'), fileResults(query));
      if (!rows.length) results.append(h('p', { class: 'search-empty' }, t('search.noResults', { query: input.value.trim() })));
      setActive(rows.length ? 0 : -1, false);
    }
    results.scrollTop = 0;
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      (rows[active] || rows[0])?.run();
    }
  });
  el.addEventListener('contextmenu', (e) => {
    if (e.target !== input) e.preventDefault();
  });

  flyouts.register('search', {
    el,
    onOpen(data) {
      i18n.apply(el);
      input.value = data?.query ?? '';
      render();
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    },
    onClose() {
      input.value = '';
    }
  });
  i18n.apply(el);

  return { el };
}
