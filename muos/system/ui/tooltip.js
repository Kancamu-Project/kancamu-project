import { h, clamp } from '../core/dom.js';
import { TOOLTIP_DELAY } from '../config/shell.js';

/**
 * Tooltips for any element with a `data-tip="text"` attribute.
 * Call once per document.
 */
let installed = false;

export function initTooltips() {
  if (installed) return;
  installed = true;

  let tip = null;
  let timer = 0;
  let current = null;

  const hide = () => {
    clearTimeout(timer);
    current = null;
    if (tip) {
      tip.remove();
      tip = null;
    }
  };

  const show = (el) => {
    const text = el.dataset.tip;
    if (!text || !el.isConnected) return;
    tip = h('div', { class: 'tooltip', role: 'tooltip' }, text);
    document.body.append(tip);
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const hh = tip.offsetHeight;
    const gap = 8;
    let y = r.top - hh - gap;
    if (y < 4) y = r.bottom + gap;
    const x = clamp(r.left + (r.width - w) / 2, 4, Math.max(4, window.innerWidth - w - 4));
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(y)}px`;
  };

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || !(e.target instanceof Element)) return;
    const el = e.target.closest('[data-tip]');
    if (el === current) return;
    hide();
    if (!el) return;
    current = el;
    timer = setTimeout(() => show(el), TOOLTIP_DELAY);
  });
  document.addEventListener('pointerout', (e) => {
    if (current && !(e.relatedTarget instanceof Node && current.contains(e.relatedTarget))) hide();
  });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  document.addEventListener('wheel', hide, { capture: true, passive: true });
  window.addEventListener('blur', hide);
}
