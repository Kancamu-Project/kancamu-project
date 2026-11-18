import { Emitter } from '../core/events.js';
import { h, icon, iconUrl } from '../core/dom.js';
import { settings } from '../core/settings.js';
import { apps } from '../core/apps.js';
import { t } from '../core/i18n.js';
import { playSound } from '../core/sound.js';
import { NOTIFICATION_LIFETIME as LIFETIME, NOTIFICATIONS_MAX_KEPT as MAX_KEPT } from '../config/shell.js';
import { NOTIFICATION_EXIT_DELAY } from '../config/shell.js';

/**
 * Notifications: a toast pops up above the taskbar, and every notification is
 * kept in the list shown above the calendar until it is cleared.
 * "Do not disturb" silences the toast but still records the notification.
 *
 * Event: 'change'
 */
export function createNotifications(shell) {
  const emitter = new Emitter();
  const container = document.getElementById('toasts');
  const notes = [];
  let sequence = 0;
  let unread = 0;

  function notify({ title, body = '', appId = null, onClick = null, silent = false } = {}) {
    const app = appId ? apps.get(appId) : null;
    const note = {
      id: ++sequence,
      title: String(title ?? ''),
      body: String(body ?? ''),
      time: Date.now(),
      appId: app?.id ?? null,
      iconUrl: app?.icon ?? iconUrl('logo'),
      onClick
    };
    notes.unshift(note);
    if (notes.length > MAX_KEPT) notes.length = MAX_KEPT;
    if (!shell.flyouts.isOpen('calendar')) unread++;
    emitter.emit('change');
    if (!silent && !settings.get('doNotDisturb')) {
      toast(note);
      playSound('notify');
    }
    return note.id;
  }

  function sourceOf(note) {
    return note.appId ? apps.name(note.appId) : t('notifications.system');
  }

  function open(note) {
    dismiss(note.id);
    try {
      if (note.onClick) note.onClick();
      else if (note.appId) shell.launch(note.appId);
    } catch (err) {
      console.error('[notifications] click handler failed', err);
    }
  }

  function toast(note) {
    let timer = 0;
    const close = () => {
      clearTimeout(timer);
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), NOTIFICATION_EXIT_DELAY);
    };
    const el = h(
      'div',
      { class: 'toast', role: 'status', dataset: { id: note.id } },
      h(
        'div',
        { class: 'toast-head' },
        h('img', { src: note.iconUrl, alt: '', draggable: false }),
        h('span', { class: 'toast-source' }, sourceOf(note)),
        h(
          'button',
          {
            class: 'toast-close',
            type: 'button',
            'aria-label': t('notifications.dismiss'),
            onclick: (e) => {
              e.stopPropagation();
              close();
            }
          },
          icon('dismiss', { size: 12 })
        )
      ),
      h('div', { class: 'toast-title' }, note.title),
      note.body ? h('div', { class: 'toast-body' }, note.body) : null
    );
    el.addEventListener('click', () => {
      close();
      open(note);
    });
    const arm = () => (timer = setTimeout(close, LIFETIME));
    el.addEventListener('pointerenter', () => clearTimeout(timer));
    el.addEventListener('pointerleave', arm);
    container.append(el);
    arm();
  }

  function dismiss(id) {
    const index = notes.findIndex((note) => note.id === id);
    if (index < 0) return;
    notes.splice(index, 1);
    container.querySelector(`.toast[data-id="${id}"]`)?.remove();
    emitter.emit('change');
  }

  function clear() {
    notes.length = 0;
    unread = 0;
    container.replaceChildren();
    emitter.emit('change');
  }

  function markRead() {
    if (!unread) return;
    unread = 0;
    emitter.emit('change');
  }

  return {
    notify,
    dismiss,
    clear,
    open,
    markRead,
    sourceOf,
    list: () => notes,
    get unread() {
      return unread;
    },
    on: (type, fn) => emitter.on(type, fn)
  };
}
