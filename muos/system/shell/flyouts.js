import { Emitter } from '../core/events.js';
import { closeMenus, isMenuOpen } from '../ui/menu.js';

/**
 * The panels that pop up from the taskbar (Start, Search, Quick settings,
 * Calendar). Only one can be open at a time; a click anywhere else closes it.
 *
 * A toggle button is marked with data-flyout="<name>" so that pressing it
 * while its panel is open closes the panel instead of re-opening it.
 *
 * Event: 'change' (name | null)
 */
export class Flyouts extends Emitter {
  #items = new Map();
  current = null;

  constructor() {
    super();
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.current || !(e.target instanceof Element)) return;
        if (this.#items.get(this.current).el.contains(e.target)) return;
        if (e.target.closest(`[data-flyout="${this.current}"], .menu-layer, .dialog-smoke`)) return;
        this.close();
      },
      true
    );
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.current && !isMenuOpen()) {
        e.preventDefault();
        this.close();
      }
    });
    // the pointer went into an app window, or the browser lost focus
    window.addEventListener('blur', () => this.close());
  }

  register(name, { el, onOpen, onClose }) {
    el.inert = true;
    this.#items.set(name, { el, onOpen, onClose });
  }

  isOpen(name) {
    return this.current === name;
  }

  open(name, data) {
    const item = this.#items.get(name);
    if (!item) return;
    if (this.current === name) {
      item.onOpen?.(data);
      return;
    }
    this.close();
    closeMenus();
    this.current = name;
    item.el.inert = false;
    item.el.classList.add('is-open');
    item.onOpen?.(data);
    this.emit('change', name);
  }

  close() {
    if (!this.current) return;
    const item = this.#items.get(this.current);
    this.current = null;
    item.el.classList.remove('is-open');
    item.el.inert = true;
    item.onClose?.();
    this.emit('change', null);
  }

  toggle(name, data) {
    if (this.current === name) this.close();
    else this.open(name, data);
  }
}
