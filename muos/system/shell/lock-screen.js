import { h, icon, setIcon, picture } from '../core/dom.js';
import { settings } from '../core/settings.js';
import { i18n } from '../core/i18n.js';
import { wallpaperBackground, networkIcon, batteryIcon, WALLPAPER_KEYS, NETWORK_KEYS } from '../core/system.js';
import { LOCK_LEAVE_DELAY } from '../config/shell.js';

/** Hours and minutes without the AM/PM marker, as on a lock screen. */
function lockTime(date) {
  const options = { hour: 'numeric', minute: '2-digit', ...(settings.get('clock24h') ? { hourCycle: 'h23' } : { hour12: true }) };
  return new Intl.DateTimeFormat(i18n.locale, options)
    .formatToParts(date)
    .filter((part) => part.type !== 'dayPeriod')
    .map((part) => part.value)
    .join('')
    .trim();
}

/**
 * Lock screen: a clock over the wallpaper; any click or key reveals the
 * sign-in panel. There is no password - "Sign in" unlocks the desktop.
 */
export function createLockScreen(shell) {
  const el = document.getElementById('lock');
  const screen = document.getElementById('screen');

  const bg = h('div', { class: 'lock-bg' });
  const timeEl = h('div', { class: 'lock-time' });
  const dateEl = h('div', { class: 'lock-date' });
  const nameEl = h('div', { class: 'lock-name' });
  const signIn = h('button', { class: 'btn lock-signin', type: 'button', 'data-i18n': 'lock.signIn', onclick: () => unlock() });
  const netGlyph = icon('wifi', { size: 18 });

  el.tabIndex = -1;
  el.append(
    bg,
    h('div', { class: 'lock-clock' }, timeEl, dateEl),
    h('div', { class: 'lock-login' }, picture('avatar', { class: 'lock-avatar' }), nameEl, signIn, h('p', { class: 'lock-hint', 'data-i18n': 'lock.hint' })),
    h('div', { class: 'lock-status' }, netGlyph, batteryIcon())
  );

  let locked = false;

  function update() {
    const now = new Date();
    timeEl.textContent = lockTime(now);
    dateEl.textContent = i18n.date(now, { weekday: 'long', month: 'long', day: 'numeric' });
    nameEl.textContent = settings.get('userName');
    bg.style.background = wallpaperBackground();
    setIcon(netGlyph, networkIcon());
    i18n.apply(el);
  }

  /** Lock the session. `login: true` goes straight to the sign-in panel. */
  function show({ login = false } = {}) {
    locked = true;
    update();
    shell.flyouts?.close();
    screen.inert = true;
    el.hidden = false;
    el.classList.toggle('is-login', login);
    el.classList.remove('is-leaving');
    (login ? signIn : el).focus({ preventScroll: true });
  }

  function reveal() {
    if (!locked || el.classList.contains('is-login')) return;
    el.classList.add('is-login');
    signIn.focus({ preventScroll: true });
  }

  function unlock() {
    if (!locked) return;
    locked = false;
    screen.inert = false;
    el.classList.add('is-leaving');
    setTimeout(() => {
      if (locked) return;
      el.hidden = true;
      el.classList.remove('is-leaving', 'is-login');
    }, LOCK_LEAVE_DELAY);
    shell.emit('unlock');
  }

  el.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('.lock-login')) reveal();
  });
  el.addEventListener('keydown', (e) => {
    if (!locked) return;
    if (!el.classList.contains('is-login')) {
      if (!['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) {
        e.preventDefault();
        reveal();
      }
    } else if (e.key === 'Escape') {
      el.classList.remove('is-login');
      el.focus({ preventScroll: true });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      unlock();
    }
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  shell.on('tick', () => locked && update());
  settings.on('change', (key) => {
    if (locked && (WALLPAPER_KEYS.has(key) || NETWORK_KEYS.has(key) || key === 'userName' || key === 'clock24h')) update();
  });
  i18n.on('change', () => locked && update());

  return {
    show,
    unlock,
    get locked() {
      return locked;
    }
  };
}
