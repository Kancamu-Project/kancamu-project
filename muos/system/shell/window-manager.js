import { Emitter } from '../core/events.js';
import { h, icon, setIcon, clamp, motionOK } from '../core/dom.js';
import { apps } from '../core/apps.js';
import { ROOT } from '../core/paths.js';
import { settings } from '../core/settings.js';
import { i18n, t } from '../core/i18n.js';
import { showMenu } from '../ui/menu.js';
import { WINDOW_TITLE_HEIGHT as TITLE_HEIGHT, SNAP_EDGE as EDGE, SNAP_CORNER as CORNER, WINDOW_LAYOUTS as LAYOUTS } from '../config/shell.js';
import { APP_FRAME_SANDBOX, APP_FRAME_REFERRER_POLICY, WINDOW_READY_FALLBACK, WINDOW_MIN_FIT_WIDTH, WINDOW_SCREEN_MARGIN, WINDOW_MIN_FIT_HEIGHT } from '../config/shell.js';

export const SNAP_RECTS = LAYOUTS;

let sequence = 0;

/**
 * Creates, stacks, moves, resizes, snaps, minimizes and closes app windows.
 * Every window hosts one app page in an <iframe>.
 *
 * Events: 'open' (win), 'close' (win), 'focus' (win | null), 'change' (win),
 *         'content-pointerdown' (win)
 */
export class WindowManager extends Emitter {
  windows = new Map();
  /** window ids, bottom to top */
  stack = [];
  activeId = null;
  /** Virtual desktops: the one being shown, and how many there are. Every window lives on exactly one. */
  desktop = 0;
  desktopCount = 1;
  /** set by the taskbar: (appId) => rect of the app's taskbar button */
  anchorFor = null;

  #container;
  #preview;
  #cascade = 0;
  #peeked = null;

  constructor(container) {
    super();
    this.#container = container;
    this.#preview = h('div', { class: 'snap-preview' });
    container.append(this.#preview);

    window.addEventListener('resize', () => this.#keepReachable());

    // Fallback for pages we cannot hook into (other origins): when the focus
    // moves into an iframe, its window becomes the active one.
    window.addEventListener('blur', () => {
      setTimeout(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLIFrameElement)) return;
        const win = this.list().find((w) => w.iframe === el);
        if (win && !win.minimized && this.activeId !== win.id) this.activate(win.id, { focusContent: false });
      }, 0);
    });

    i18n.on('change', () => {
      for (const win of this.windows.values()) {
        if (!win.customTitle) this.setTitle(win.id, '');
        this.#labelButtons(win);
      }
    });
  }

  /* ------------------------------ queries ------------------------------- */

  get(id) {
    return this.windows.get(id) || null;
  }

  get active() {
    return this.get(this.activeId);
  }

  list() {
    return [...this.windows.values()];
  }

  /** Windows of an app. With { here: true } only those on the desktop being shown. */
  byApp(appId, { here = false } = {}) {
    return this.list().filter((win) => win.appId === appId && (!here || win.desktop === this.desktop));
  }

  /** The windows on a desktop (the current one by default). */
  onDesktop(index = this.desktop) {
    return this.list().filter((win) => win.desktop === index);
  }

  findByContentWindow(contentWindow) {
    return this.list().find((win) => win.iframe.contentWindow === contentWindow) || null;
  }

  #area() {
    return this.#container.getBoundingClientRect();
  }

  /* ------------------------------ lifecycle ----------------------------- */

  /** Open an app. Returns the window, or null when the app does not exist. */
  open(appId, args = {}) {
    const app = apps.get(appId);
    if (!app) return null;

    if (app.singleInstance) {
      const existing = this.byApp(appId)[0];
      if (existing) {
        existing.args = args ?? {};
        this.activate(existing.id);
        existing.notify('args', existing.args);
        return existing;
      }
    }

    const area = this.#area();
    const win = {
      id: `w${++sequence}`,
      app,
      appId: app.id,
      args: args ?? {},
      title: apps.name(app),
      customTitle: false,
      layout: area.width < 700 || area.height < 460 ? 'max' : 'normal',
      minimized: false,
      desktop: this.desktop,
      opened: Date.now(),
      bounds: this.#initialBounds(app, area),
      handlers: {},
      notify(type, payload) {
        for (const fn of [...(this.handlers[type] ?? [])]) {
          try {
            fn(payload);
          } catch (err) {
            console.error(`[window] "${type}" handler failed`, err);
          }
        }
      }
    };

    this.#build(win);
    this.windows.set(win.id, win);
    this.stack.push(win.id);
    this.#container.append(win.el);
    this.#applyLayout(win);
    this.#applyZ();

    if (motionOK()) {
      win.el.animate(
        [
          { transform: 'scale(.92)', opacity: 0 },
          { transform: 'none', opacity: 1 }
        ],
        { duration: 220, easing: 'cubic-bezier(.1,.9,.2,1)' }
      );
    }

    this.emit('open', win);
    this.activate(win.id);
    return win;
  }

  close(id) {
    const win = this.get(id);
    if (!win) return;
    this.windows.delete(id);
    this.stack = this.stack.filter((other) => other !== id);
    win.handlers = {};

    const remove = () => win.el.remove();
    if (motionOK() && !win.minimized) {
      win.el.style.pointerEvents = 'none';
      const anim = win.el.animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: 'scale(.94)', opacity: 0 }
        ],
        { duration: 130, easing: 'ease-in', fill: 'forwards' }
      );
      anim.onfinish = remove;
      anim.oncancel = remove;
    } else {
      remove();
    }

    if (this.activeId === id) {
      this.activeId = null;
      this.#activateTop();
    }
    this.emit('close', win);
  }

  closeAll() {
    for (const win of this.list()) this.close(win.id);
  }

  /**
   * Close on the user's behalf: an app that registered a close guard (unsaved
   * work) is asked first and can say no. Resolves true when the window closed.
   */
  async requestClose(id) {
    const win = this.get(id);
    if (!win) return true;
    if (win.closeGuard) {
      this.activate(id);
      let allowed = true;
      try {
        allowed = (await win.closeGuard()) !== false;
      } catch (err) {
        console.error('[window] close guard failed', err);
      }
      if (!allowed) return false;
    }
    this.close(id);
    return true;
  }

  /** Ask every window to close (before sign out, restart or shut down). False if one refused. */
  async requestCloseAll() {
    for (const win of [...this.list()].reverse()) {
      if (!(await this.requestClose(win.id))) return false;
    }
    return true;
  }

  /** True when any app reported unsaved work. */
  get hasUnsavedWork() {
    return this.list().some((win) => win.dirty);
  }

  /* ------------------------------ focus --------------------------------- */

  activate(id, { focusContent = true } = {}) {
    const win = this.get(id);
    if (!win) return;
    if (win.desktop !== this.desktop) this.setDesktop(win.desktop);
    if (win.minimized) this.#unminimize(win);

    if (this.stack[this.stack.length - 1] !== id) {
      this.stack = this.stack.filter((other) => other !== id);
      this.stack.push(id);
      this.#applyZ();
    }

    if (this.activeId !== id) {
      const previous = this.active;
      this.activeId = id;
      if (previous) {
        previous.el.classList.remove('is-active');
        previous.notify('deactivate');
      }
      win.el.classList.add('is-active');
      win.notify('activate');
      this.emit('focus', win);
    }
    if (focusContent) this.focusContent(win);
  }

  /** No window is active any more (the desktop was clicked). */
  blur() {
    const previous = this.active;
    if (!previous) return;
    this.activeId = null;
    previous.el.classList.remove('is-active');
    previous.notify('deactivate');
    this.#releaseFocus(previous);
    this.emit('focus', null);
  }

  /** Take the keyboard away from a window that is no longer in use. */
  #releaseFocus(win) {
    if (document.activeElement === win.iframe) win.iframe.blur();
  }

  focusContent(win = this.active) {
    if (!win) return;
    try {
      win.iframe.contentWindow.focus();
    } catch {
      /* ignore */
    }
  }

  #activateTop() {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const win = this.get(this.stack[i]);
      if (win && !win.minimized && win.desktop === this.desktop) return this.activate(win.id);
    }
    this.blur();
    this.emit('focus', null);
  }

  #applyZ() {
    this.stack.forEach((id, i) => {
      const win = this.get(id);
      if (win) win.el.style.zIndex = String(10 + i * 2); // odd numbers are left for the snap preview
    });
  }

  /* --------------------------- virtual desktops -------------------------- */

  /** Show another desktop; the windows of the others are hidden. */
  setDesktop(index) {
    if (index < 0 || index >= this.desktopCount || index === this.desktop) return;
    const active = this.active;
    this.desktop = index;
    for (const win of this.windows.values()) win.el.classList.toggle('is-elsewhere', win.desktop !== index);
    if (active && active.desktop !== index) {
      this.#releaseFocus(active);
      active.el.classList.remove('is-active');
      active.notify('deactivate');
      this.activeId = null;
    }
    this.#activateTop();
    this.emit('desktop', index);
  }

  addDesktop() {
    this.desktopCount++;
    this.emit('desktop', this.desktop);
    return this.desktopCount - 1;
  }

  /** Remove a desktop; its windows move to the one before it. */
  removeDesktop(index) {
    if (this.desktopCount < 2 || index < 0 || index >= this.desktopCount) return;
    const into = Math.max(0, index - 1);
    for (const win of this.windows.values()) {
      if (win.desktop === index) win.desktop = into;
      else if (win.desktop > index) win.desktop--;
    }
    this.desktopCount--;
    const current = this.desktop === index ? into : this.desktop > index ? this.desktop - 1 : this.desktop;
    this.desktop = -1; // force the switch below to repaint
    this.setDesktop(current);
  }

  moveToDesktop(id, index) {
    const win = this.get(id);
    if (!win || index < 0 || index >= this.desktopCount) return;
    win.desktop = index;
    win.el.classList.toggle('is-elsewhere', index !== this.desktop);
    if (this.activeId === id && index !== this.desktop) {
      this.activeId = null;
      win.el.classList.remove('is-active');
      win.notify('deactivate');
      this.#activateTop();
    }
    this.emit('change', win);
  }

  /* ------------------------------ state --------------------------------- */

  setTitle(id, title) {
    const win = this.get(id);
    if (!win) return;
    win.customTitle = !!title;
    win.title = title || apps.name(win.app);
    win.titleEl.textContent = win.title;
    win.iframe.title = win.title;
    win.el.setAttribute('aria-label', win.title);
    this.emit('change', win);
  }

  minimize(id) {
    const win = this.get(id);
    if (!win || win.minimized) return;
    win.minimized = true;
    win.anim?.cancel();

    const hide = () => {
      if (win.minimized) win.el.classList.add('is-minimized');
    };
    const frames = this.#minimizeFrames(win);
    if (frames) {
      win.anim = win.el.animate(frames, { duration: 220, easing: 'cubic-bezier(.4,0,1,1)' });
      win.anim.onfinish = hide;
    } else {
      hide();
    }

    this.#releaseFocus(win);
    if (this.activeId === id) {
      this.activeId = null;
      win.el.classList.remove('is-active');
      win.notify('deactivate');
      this.#activateTop();
    }
    this.emit('change', win);
  }

  #unminimize(win) {
    win.minimized = false;
    win.anim?.cancel();
    win.el.classList.remove('is-minimized');
    const frames = this.#minimizeFrames(win);
    if (frames) win.anim = win.el.animate(frames.reverse(), { duration: 220, easing: 'cubic-bezier(.1,.9,.2,1)' });
    this.emit('change', win);
  }

  /** Keyframes that shrink the window into its taskbar button. */
  #minimizeFrames(win) {
    if (!motionOK()) return null;
    const target = this.anchorFor?.(win.appId);
    if (!target) return null;
    const r = win.el.getBoundingClientRect();
    const dx = target.left + target.width / 2 - (r.left + r.width / 2);
    const dy = target.top + target.height / 2 - (r.top + r.height / 2);
    return [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0 }
    ];
  }

  toggleMaximize(id) {
    const win = this.get(id);
    if (!win) return;
    this.setLayout(id, win.layout === 'max' ? 'normal' : 'max');
  }

  /** layout: 'normal' | 'max' | 'left' | 'right' | 'top-left' | ... */
  setLayout(id, layout, { animate = true } = {}) {
    const win = this.get(id);
    if (!win || win.layout === layout || (layout !== 'normal' && !LAYOUTS[layout])) return;
    const from = win.el.getBoundingClientRect();
    win.layout = layout;
    this.#applyLayout(win);
    if (animate && motionOK()) {
      const to = win.el.getBoundingClientRect();
      const area = this.#area();
      const frame = (r) => ({
        left: `${r.left - area.left}px`,
        top: `${r.top - area.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`
      });
      win.el.animate([frame(from), frame(to)], { duration: 190, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    this.emit('change', win);
  }

  /** Minimize everything, or bring back what the last call minimized. */
  toggleShowDesktop() {
    const visible = this.onDesktop().filter((win) => !win.minimized);
    if (visible.length) {
      this.#peeked = this.stack.filter((id) => visible.some((win) => win.id === id));
      visible.forEach((win) => this.minimize(win.id));
    } else if (this.#peeked) {
      const ids = this.#peeked.filter((id) => this.get(id));
      this.#peeked = null;
      ids.forEach((id) => this.activate(id));
    }
  }

  #applyLayout(win) {
    const style = win.el.style;
    if (win.layout === 'normal') {
      const b = win.bounds;
      style.left = `${b.x}px`;
      style.top = `${b.y}px`;
      style.width = `${b.w}px`;
      style.height = `${b.h}px`;
    } else {
      Object.assign(style, LAYOUTS[win.layout]);
    }
    win.el.classList.toggle('is-maximized', win.layout === 'max');
    win.el.classList.toggle('is-snapped', win.layout !== 'normal' && win.layout !== 'max');
    setIcon(win.maxIcon, win.layout === 'max' ? 'win-restore' : 'win-maximize');
    this.#labelButtons(win);
  }

  #labelButtons(win) {
    const set = (btn, key) => {
      btn.dataset.tip = t(key);
      btn.setAttribute('aria-label', t(key));
    };
    set(win.minBtn, 'window.minimize');
    set(win.maxBtn, win.layout === 'max' ? 'window.restore' : 'window.maximize');
    set(win.closeBtn, 'window.close');
  }

  #initialBounds(app, area) {
    const w = Math.min(app.window.width, Math.max(WINDOW_MIN_FIT_WIDTH, area.width - WINDOW_SCREEN_MARGIN));
    const hgt = Math.min(app.window.height, Math.max(WINDOW_MIN_FIT_HEIGHT, area.height - WINDOW_SCREEN_MARGIN));
    const n = this.#cascade++ % 8;
    const x = Math.round((area.width - w) / 2) + (n - 2) * 28;
    const y = Math.round((area.height - hgt) / 2) + (n - 2) * 28;
    return {
      x: clamp(x, 8, Math.max(8, area.width - w - 8)),
      y: clamp(y, 8, Math.max(8, area.height - hgt - 8)),
      w,
      h: hgt
    };
  }

  /** The screen got smaller or larger: no window stays bigger than the room it has, and each one sits inside it. */
  #keepReachable() {
    const area = this.#area();
    for (const win of this.windows.values()) {
      const b = win.bounds;
      b.w = Math.min(b.w, Math.max(WINDOW_MIN_FIT_WIDTH, area.width - WINDOW_SCREEN_MARGIN));
      b.h = Math.min(b.h, Math.max(WINDOW_MIN_FIT_HEIGHT, area.height - WINDOW_SCREEN_MARGIN));
      const edge = WINDOW_SCREEN_MARGIN / 2; // the same space on every side
      b.x = clamp(b.x, edge, Math.max(edge, area.width - b.w - edge));
      b.y = clamp(b.y, edge, Math.max(edge, area.height - b.h - edge));
      if (win.layout === 'normal') this.#applyLayout(win);
    }
  }

  /* ------------------------------ building ------------------------------ */

  #build(win) {
    const caption = (cls, glyph, action) => {
      const glyphEl = icon(glyph); // its size is in style/window.css
      const btn = h('button', { class: `window-btn ${cls}`, type: 'button', tabIndex: -1, onclick: () => action() }, glyphEl);
      return [btn, glyphEl];
    };
    const [minBtn] = caption('window-min', 'win-minimize', () => this.minimize(win.id));
    const [maxBtn, maxIcon] = caption('window-max', 'win-maximize', () => this.toggleMaximize(win.id));
    const [closeBtn] = caption('window-close', 'win-close', () => this.requestClose(win.id));

    const titleEl = h('span', { class: 'window-title' }, win.title);
    const titlebar = h(
      'div',
      { class: 'window-titlebar' },
      h('img', { class: 'window-icon', src: win.app.icon, alt: '', draggable: false }),
      titleEl,
      h('div', { class: 'window-controls' }, minBtn, maxBtn, closeBtn)
    );
    // every page is told where the OS is, so it can load the SDK from there wherever it is hosted
    const entry = new URL(win.app.entry);
    entry.searchParams.set('os', ROOT);
    const iframe = h('iframe', { class: 'window-content', src: entry.href, title: win.title, allow: 'camera; microphone; fullscreen; clipboard-read; clipboard-write', allowFullscreen: true });
    // all pages are alike: no access to the shell, only to the messages it answers
    iframe.setAttribute('sandbox', APP_FRAME_SANDBOX);
    iframe.setAttribute('referrerpolicy', APP_FRAME_REFERRER_POLICY);
    const frame = h('div', { class: 'window-frame' }, titlebar, h('div', { class: 'window-body' }, iframe));
    const handles = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => h('div', { class: `window-resize window-resize-${dir}`, dataset: { dir } }));
    const el = h('div', { class: 'window', role: 'group', 'aria-label': win.title, dataset: { id: win.id, app: win.appId } }, frame, handles);

    Object.assign(win, { el, iframe, titlebar, titleEl, minBtn, maxBtn, closeBtn, maxIcon });

    // any press on the window chrome activates it; keep the keyboard focus in the app
    el.addEventListener('pointerdown', () => this.activate(win.id), true);
    el.addEventListener('mousedown', (e) => e.preventDefault());

    titlebar.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && !e.target.closest('.window-btn')) this.#startDrag(win, e);
    });
    titlebar.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.window-btn')) this.toggleMaximize(win.id);
    });
    titlebar.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.#systemMenu(win, e.clientX, e.clientY);
    });
    for (const handle of handles) {
      handle.addEventListener('pointerdown', (e) => {
        if (e.button === 0) this.#startResize(win, e, handle.dataset.dir);
      });
    }

    iframe.addEventListener('load', () => {
      try {
        // same-origin pages: a press inside the page activates the window
        iframe.contentWindow.addEventListener(
          'pointerdown',
          () => {
            this.emit('content-pointerdown', win);
            this.activate(win.id, { focusContent: false });
          },
          true
        );
      } catch {
        /* page from another origin: handled by the blur fallback */
      }
      // pages that do not use the app SDK never report "ready"
      setTimeout(() => el.classList.add('is-ready'), WINDOW_READY_FALLBACK);
      if (this.activeId === win.id) this.focusContent(win);
    });
  }

  #systemMenu(win, x, y) {
    showMenu(
      [
        { label: t('window.restore'), icon: 'win-restore', disabled: win.layout === 'normal', action: () => this.setLayout(win.id, 'normal') },
        { label: t('window.minimize'), icon: 'win-minimize', action: () => this.minimize(win.id) },
        { label: t('window.maximize'), icon: 'win-maximize', disabled: win.layout === 'max', action: () => this.setLayout(win.id, 'max') },
        { separator: true },
        { label: t('window.close'), icon: 'win-close', action: () => this.requestClose(win.id) }
      ],
      { x, y }
    );
  }

  /* ------------------------------ dragging ------------------------------ */

  #startDrag(win, down) {
    const { titlebar } = win;
    const area = this.#area();
    const startX = down.clientX;
    const startY = down.clientY;
    let dragging = false;
    let zone = null;
    let offsetX = 0;
    let offsetY = 0;

    const begin = (e) => {
      dragging = true;
      this.#container.classList.add('is-busy');
      win.el.classList.add('is-dragging');
      // offsets are measured from where the button went down, so the window
      // does not lag behind by the distance of the first movement
      const rect = win.el.getBoundingClientRect();
      offsetY = clamp(startY - rect.top, 0, TITLE_HEIGHT);
      if (win.layout === 'normal') {
        offsetX = startX - rect.left;
      } else {
        // a maximized / snapped window pops back to its free size under the pointer
        const ratio = clamp((startX - rect.left) / rect.width, 0, 1);
        offsetX = Math.round(win.bounds.w * ratio);
        win.layout = 'normal';
        win.bounds.x = e.clientX - area.left - offsetX;
        win.bounds.y = e.clientY - area.top - offsetY;
        this.#applyLayout(win);
        this.emit('change', win);
      }
    };

    const move = (e) => {
      if (!dragging) {
        if (Math.abs(e.clientX - startX) < 4 && Math.abs(e.clientY - startY) < 4) return;
        begin(e);
      }
      const b = win.bounds;
      b.x = clamp(e.clientX - area.left - offsetX, 80 - b.w, area.width - 80);
      b.y = clamp(e.clientY - area.top - offsetY, 0, Math.max(0, area.height - TITLE_HEIGHT));
      win.el.style.left = `${b.x}px`;
      win.el.style.top = `${b.y}px`;
      zone = settings.get('snapWindows') ? this.#zoneAt(e.clientX - area.left, e.clientY - area.top, area) : null;
      this.#showPreview(zone);
    };

    const end = () => {
      titlebar.removeEventListener('pointermove', move);
      titlebar.removeEventListener('pointerup', end);
      titlebar.removeEventListener('pointercancel', end);
      if (!dragging) return;
      this.#container.classList.remove('is-busy');
      win.el.classList.remove('is-dragging');
      this.#showPreview(null);
      if (zone) this.setLayout(win.id, zone);
      this.focusContent(win);
    };

    try {
      titlebar.setPointerCapture(down.pointerId);
    } catch {
      /* ignore */
    }
    titlebar.addEventListener('pointermove', move);
    titlebar.addEventListener('pointerup', end);
    titlebar.addEventListener('pointercancel', end);
  }

  #zoneAt(x, y, area) {
    const atLeft = x <= EDGE;
    const atRight = x >= area.width - EDGE - 1;
    const atTop = y <= EDGE;
    if (atTop) {
      if (x < CORNER) return 'top-left';
      if (x > area.width - CORNER) return 'top-right';
      return 'max';
    }
    if (atLeft) return y < CORNER ? 'top-left' : y > area.height - CORNER ? 'bottom-left' : 'left';
    if (atRight) return y < CORNER ? 'top-right' : y > area.height - CORNER ? 'bottom-right' : 'right';
    return null;
  }

  #showPreview(zone) {
    const el = this.#preview;
    if (!zone) {
      el.classList.remove('is-visible');
      return;
    }
    Object.assign(el.style, LAYOUTS[zone]);
    el.style.zIndex = String(9 + (this.stack.length - 1) * 2); // just below the dragged (top) window
    el.classList.add('is-visible');
  }

  /* ------------------------------ resizing ------------------------------ */

  #startResize(win, down, dir) {
    if (win.layout === 'max') return;
    const handle = down.currentTarget;
    const area = this.#area();
    if (win.layout !== 'normal') {
      // resizing a snapped window turns it back into a free window
      const rect = win.el.getBoundingClientRect();
      win.bounds = { x: rect.left - area.left, y: rect.top - area.top, w: rect.width, h: rect.height };
      win.layout = 'normal';
      this.#applyLayout(win);
      this.emit('change', win);
    }
    const screenW = window.innerWidth - area.left; // the work area ends above the dock, the screen does not
    const screenH = window.innerHeight - area.top;
    const start = { ...win.bounds };
    const minW = Math.min(win.app.window.minWidth, start.w);
    const minH = Math.min(win.app.window.minHeight, start.h);
    const startX = down.clientX;
    const startY = down.clientY;
    this.#container.classList.add('is-busy');

    const move = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const b = win.bounds;
      if (dir.includes('e')) b.w = Math.max(minW, start.w + dx);
      if (dir.includes('s')) b.h = Math.max(minH, start.h + dy);
      if (dir.includes('w')) {
        b.w = Math.max(minW, start.w - dx);
        b.x = start.x + start.w - b.w;
      }
      if (dir.includes('n')) {
        const top = clamp(start.y + dy, 0, start.y + start.h - minH);
        b.h = start.y + start.h - top;
        b.y = top;
      }
      // never beyond the screen: what is outside it is cut off
      if (b.x < 0) {
        b.w += b.x;
        b.x = 0;
      }
      b.w = Math.min(b.w, Math.max(minW, screenW - b.x));
      b.h = Math.min(b.h, Math.max(minH, screenH - b.y));
      this.#applyLayout(win);
    };

    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      this.#container.classList.remove('is-busy');
      this.focusContent(win);
    };

    try {
      handle.setPointerCapture(down.pointerId);
    } catch {
      /* ignore */
    }
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}
