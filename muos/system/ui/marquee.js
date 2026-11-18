import { h } from '../core/dom.js';

/**
 * Rubber-band selection: drag on the empty part of a container to draw a
 * rectangle and select everything it touches.
 *
 *   attachMarquee(container, {
 *     items: () => container.querySelectorAll('.item'),
 *     isBackground: (target) => !target.closest('.item'),
 *     onSelect: (elements, { additive }) => { ... }   // called while dragging
 *   });
 *
 * The container must be positioned (relative / absolute).
 */
export function attachMarquee(container, { items, isBackground, onSelect }) {
  container.addEventListener('pointerdown', (down) => {
    if (down.button !== 0 || !(down.target instanceof Element) || !isBackground(down.target)) return;
    // a press on the container's own scrollbar is not the start of a selection
    const bounds = container.getBoundingClientRect();
    if (down.clientX - bounds.left >= container.clientLeft + container.clientWidth) return;
    if (down.clientY - bounds.top >= container.clientTop + container.clientHeight) return;

    const additive = down.ctrlKey || down.shiftKey;
    let box = null;
    const origin = toContent(down);

    function toContent(e) {
      const r = container.getBoundingClientRect();
      return { x: e.clientX - r.left + container.scrollLeft, y: e.clientY - r.top + container.scrollTop };
    }

    const onMove = (e) => {
      const p = toContent(e);
      if (!box) {
        if (Math.abs(p.x - origin.x) < 5 && Math.abs(p.y - origin.y) < 5) return;
        box = h('div', { class: 'marquee' });
        container.append(box);
        container.setPointerCapture(down.pointerId);
      }
      const left = Math.max(0, Math.min(p.x, origin.x));
      const top = Math.max(0, Math.min(p.y, origin.y));
      const right = Math.min(container.scrollWidth, Math.max(p.x, origin.x));
      const bottom = Math.min(container.scrollHeight, Math.max(p.y, origin.y));
      Object.assign(box.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });

      const b = box.getBoundingClientRect();
      const hit = [];
      for (const el of items()) {
        const r = el.getBoundingClientRect();
        if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) hit.push(el);
      }
      onSelect(hit, { additive });
    };

    const onUp = () => {
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      if (box) {
        box.remove();
        // the click that follows a drag must not clear the new selection
        const swallow = (e) => e.stopImmediatePropagation();
        container.addEventListener('click', swallow, true);
        setTimeout(() => container.removeEventListener('click', swallow, true), 0);
      }
    };

    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);
  });
}
