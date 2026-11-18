import { h, icon, clear } from '../core/dom.js';
import { i18n, t } from '../core/i18n.js';
import { formatClock } from '../core/format.js';

/** 0 = Sunday ... 6 = Saturday, taken from the current language. */
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

/** Clock flyout: the notification list on top, a month calendar below. */
export function createCalendar(shell) {
  const { flyouts, notifications } = shell;

  // notifications card
  const noteList = h('div', { class: 'cal-notes' });
  const clearBtn = h('button', { class: 'btn btn-subtle cal-clear', type: 'button', 'data-i18n': 'notifications.clearAll', onclick: () => notifications.clear() });
  const notesCard = h('section', { class: 'cal-card' }, h('header', { class: 'cal-card-head' }, h('h2', { 'data-i18n': 'notifications.title' }), clearBtn), noteList);

  // calendar card
  const dateTitle = h('div', { class: 'cal-date' });
  const monthBtn = h('button', { class: 'cal-month', type: 'button', onclick: () => showMonth(new Date()) });
  const grid = h('div', { class: 'cal-grid' });
  const prevBtn = h('button', { class: 'cal-nav', type: 'button', onclick: () => shift(-1) }, icon('chevron-up', { size: 14 }));
  const nextBtn = h('button', { class: 'cal-nav', type: 'button', onclick: () => shift(1) }, icon('chevron-down', { size: 14 }));
  const calendarCard = h(
    'section',
    { class: 'cal-card' },
    h('header', { class: 'cal-card-head cal-today' }, dateTitle),
    h('div', { class: 'cal-month-row' }, monthBtn, h('div', { class: 'cal-navs' }, prevBtn, nextBtn)),
    grid
  );

  const el = h('div', { class: 'flyout calendar', id: 'calendar-flyout', tabIndex: -1, role: 'dialog' }, notesCard, calendarCard);
  document.getElementById('flyouts').append(el);

  let view = new Date();

  function shift(months) {
    showMonth(new Date(view.getFullYear(), view.getMonth() + months, 1));
  }

  function showMonth(date) {
    view = new Date(date.getFullYear(), date.getMonth(), 1);
    renderMonth();
  }

  function renderMonth() {
    const today = new Date();
    const first = firstDayOfWeek();
    monthBtn.textContent = i18n.date(view, { month: 'long', year: 'numeric' });
    monthBtn.dataset.tip = t('calendar.today');
    prevBtn.setAttribute('aria-label', t('calendar.previous'));
    nextBtn.setAttribute('aria-label', t('calendar.next'));
    clear(grid);

    // weekday header (1 August 2021 is a Sunday); two letters where that is unambiguous
    const names = Array.from({ length: 7 }, (_, i) => i18n.date(new Date(2021, 7, 1 + ((first + i) % 7)), { weekday: 'short' }));
    const short = names.map((name) => name.slice(0, 2));
    const labels = new Set(short).size === 7 ? short : names;
    for (const label of labels) grid.append(h('span', { class: 'cal-weekday' }, label));

    const offset = (view.getDay() - first + 7) % 7;
    for (let i = 0; i < 42; i++) {
      const day = new Date(view.getFullYear(), view.getMonth(), 1 - offset + i);
      const outside = day.getMonth() !== view.getMonth();
      const isToday = day.toDateString() === today.toDateString();
      grid.append(
        h('span', { class: `cal-day${outside ? ' is-outside' : ''}${isToday ? ' is-today' : ''}`, 'aria-current': isToday ? 'date' : null }, String(day.getDate()))
      );
    }
  }

  function renderHeader() {
    const now = new Date();
    dateTitle.textContent = i18n.date(now, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function renderNotes() {
    const notes = notifications.list();
    clear(noteList);
    clearBtn.hidden = notes.length === 0;
    if (!notes.length) {
      noteList.append(h('p', { class: 'cal-empty' }, t('notifications.empty')));
      return;
    }
    for (const note of notes) {
      const item = h(
        'div',
        { class: 'cal-note', role: 'button', tabIndex: 0 },
        h(
          'div',
          { class: 'toast-head' },
          h('img', { src: note.iconUrl, alt: '', draggable: false }),
          h('span', { class: 'toast-source' }, notifications.sourceOf(note)),
          h('span', { class: 'cal-note-time' }, formatClock(new Date(note.time))),
          h(
            'button',
            {
              class: 'toast-close',
              type: 'button',
              'aria-label': t('notifications.dismiss'),
              onclick: (e) => {
                e.stopPropagation();
                notifications.dismiss(note.id);
              }
            },
            icon('dismiss', { size: 12 })
          )
        ),
        h('div', { class: 'toast-title' }, note.title),
        note.body ? h('div', { class: 'toast-body' }, note.body) : null
      );
      item.addEventListener('click', () => {
        flyouts.close();
        notifications.open(note);
      });
      noteList.append(item);
    }
  }

  function render() {
    i18n.apply(el);
    renderHeader();
    renderMonth();
    renderNotes();
  }

  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener(
    'wheel',
    (e) => {
      if (e.target instanceof Element && e.target.closest('.cal-grid')) shift(e.deltaY > 0 ? 1 : -1);
    },
    { passive: true }
  );

  flyouts.register('calendar', {
    el,
    onOpen() {
      view = new Date();
      render();
      notifications.markRead();
      el.focus({ preventScroll: true });
    }
  });
  notifications.on('change', () => {
    if (flyouts.isOpen('calendar')) renderNotes();
  });
  shell.on('tick', () => {
    if (flyouts.isOpen('calendar')) renderHeader();
  });
  i18n.on('change', render);
  render();

  return { el };
}
