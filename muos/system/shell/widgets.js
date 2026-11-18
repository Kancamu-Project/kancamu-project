import { h, clear } from '../core/dom.js';
import { settings } from '../core/settings.js';
import { fs, HOME, dirname } from '../core/fs.js';
import { iconFor } from '../core/filetypes.js';
import { formatBytes, formatClock } from '../core/format.js';
import { i18n, t } from '../core/i18n.js';
import { readJSON, writeJSON } from '../core/store.js';
import { battery, networkState } from '../core/system.js';
import { WIDGET_ZONES as ZONES } from '../config/shell.js';
import { CLOCK_TICK_MARGIN, NOTES_SAVE_DELAY } from '../config/shell.js';
import { STORAGE_KEYS } from '../config/storage.js';


/** 0 = Sunday ... 6 = Saturday, from the current language. */
function firstDayOfWeek() {
  try {
    const locale = new Intl.Locale(i18n.lang);
    const info = typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;
  } catch {
    /* fall through */
  }
  return 0;
}

/**
 * The widgets board: clock and world clocks, a month, a note pad, the state
 * of this PC and the latest files. There is nothing that needs the network
 * (no weather, no news).
 */
export function createWidgets(shell) {
  const { flyouts } = shell;

  const greeting = h('h2', { class: 'wd-greeting' });
  const date = h('p', { class: 'wd-date' });
  const clock = h('div', { class: 'wd-clock' });
  const zones = h('ul', { class: 'wd-zones' });
  const month = h('div', { class: 'wd-month' });
  const notes = h('textarea', { class: 'wd-notes', spellcheck: false, rows: 5 });
  const system = h('div', { class: 'wd-system' });
  const recent = h('div', { class: 'wd-recent' });

  const card = (titleKey, ...children) => h('section', { class: 'wd-card' }, h('h3', { 'data-i18n': titleKey }), ...children);
  const el = h(
    'div',
    { class: 'flyout widgets', id: 'widgets-panel', tabIndex: -1, role: 'dialog' },
    h('div', { class: 'wd-head' }, greeting, date),
    h(
      'div',
      { class: 'wd-grid' },
      card('widgets.clock', clock, zones),
      card('widgets.calendar', month),
      card('widgets.notes', notes),
      card('widgets.thisPc', system),
      card('widgets.recent', recent)
    )
  );
  document.getElementById('flyouts').append(el);

  /* ------------------------------- rendering ------------------------------ */

  let timer = 0;

  function renderClock() {
    const now = new Date();
    const hour = now.getHours();
    greeting.textContent = t(hour < 12 ? 'widgets.morning' : hour < 18 ? 'widgets.afternoon' : 'widgets.evening', { name: settings.get('userName') });
    date.textContent = i18n.date(now, { dateStyle: 'full' });
    clock.textContent = formatClock(now, { seconds: true });
    clear(zones);
    for (const [zone, label] of ZONES) {
      let time = '';
      try {
        time = i18n.date(now, { hour: 'numeric', minute: '2-digit', timeZone: zone, ...(settings.get('clock24h') ? { hourCycle: 'h23' } : { hour12: true }) });
      } catch {
        continue;
      }
      zones.append(h('li', null, h('span', null, label), h('span', null, time)));
    }
  }

  function renderMonth() {
    const today = new Date();
    const first = firstDayOfWeek();
    const view = new Date(today.getFullYear(), today.getMonth(), 1);
    clear(month);
    month.append(h('div', { class: 'wd-month-title' }, i18n.date(view, { month: 'long', year: 'numeric' })));
    const grid = h('div', { class: 'wd-month-grid' });
    for (let i = 0; i < 7; i++) grid.append(h('span', { class: 'wd-weekday' }, i18n.date(new Date(2021, 7, 1 + ((first + i) % 7)), { weekday: 'narrow' })));
    const offset = (view.getDay() - first + 7) % 7;
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let i = 0; i < offset; i++) grid.append(h('span'));
    for (let day = 1; day <= days; day++) grid.append(h('span', { class: `wd-day${day === today.getDate() ? ' is-today' : ''}` }, String(day)));
    month.append(grid);
  }

  function renderSystem() {
    const usage = fs.usage();
    const percent = Math.min(100, Math.round((usage.used / Math.max(1, usage.capacity)) * 100));
    clear(system);
    system.append(
      h('div', { class: 'wd-row' }, h('span', null, t('widgets.battery')), h('span', null, `${battery.percent}%${battery.charging && battery.supported ? ' ⚡' : ''}`)),
      h('div', { class: 'wd-row' }, h('span', null, t('widgets.network')), h('span', null, t(`tray.network.${networkState()}`))),
      h('div', { class: 'wd-row' }, h('span', null, t('widgets.storage')), h('span', null, `${formatBytes(usage.used)} / ${formatBytes(usage.capacity)}`)),
      h('div', { class: 'wd-bar', role: 'img', 'aria-label': `${percent}%` }, h('div', { class: 'wd-bar-fill', style: { width: `${Math.max(1, percent)}%` } }))
    );
  }

  function renderRecent() {
    clear(recent);
    const files = fs.recent(HOME, 5);
    if (!files.length) return recent.append(h('p', { class: 'wd-empty' }, t('start.noRecommended')));
    for (const entry of files) {
      const row = h('button', { class: 'wd-file', type: 'button', title: dirname(entry.path) }, h('img', { src: iconFor(entry, { thumbnail: true }), alt: '', draggable: false }), h('span', null, entry.name));
      row.addEventListener('click', () => {
        flyouts.close();
        shell.openPath(entry.path);
      });
      recent.append(row);
    }
  }

  function renderAll() {
    i18n.apply(el);
    notes.placeholder = t('widgets.notesPlaceholder');
    notes.setAttribute('aria-label', t('widgets.notes'));
    renderClock();
    renderMonth();
    renderSystem();
    renderRecent();
  }

  function tick() {
    clearTimeout(timer);
    if (!el.classList.contains('is-open')) return;
    renderClock();
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + CLOCK_TICK_MARGIN);
  }

  let saveTimer = 0;
  notes.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        writeJSON(STORAGE_KEYS.widgetNotes, notes.value);
      } catch {
        /* the disk is full: the text stays in the box */
      }
    }, NOTES_SAVE_DELAY);
  });
  el.addEventListener('contextmenu', (e) => {
    if (e.target !== notes) e.preventDefault();
  });

  flyouts.register('widgets', {
    el,
    onOpen() {
      notes.value = readJSON(STORAGE_KEYS.widgetNotes, '');
      renderAll();
      tick();
      el.focus({ preventScroll: true });
    },
    onClose() {
      clearTimeout(timer);
      clearTimeout(saveTimer);
      try {
        writeJSON(STORAGE_KEYS.widgetNotes, notes.value);
      } catch {
        /* see above */
      }
    }
  });
  i18n.on('change', () => el.classList.contains('is-open') && renderAll());

  return { el };
}
