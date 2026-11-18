import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { SNIP_MODES as MODES, SNIP_MIN_SIDE as MIN_SIDE } from '../config/shell.js';
import { SNIP_FRAME_FALLBACK, SNIP_COUNTDOWN_TICK, SNIP_OUTLINE_COLOR } from '../config/shell.js';

/** An error with a code: 'unsupported' | 'denied' | 'failed'. */
export class SnipError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Screen snips. The browser is asked once for the picture of this page; the
 * picture is frozen, dimmed, and a part of it is picked: a rectangle, a
 * window, everything, or a freehand shape. The result is a PNG data URL.
 */
export function createSnip(shell) {
  const { wm } = shell;
  let busy = false;

  /** Ask the browser for a live picture of this tab. Needs a recent click. */
  async function openStream() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new SnipError('unsupported');
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' });
    } catch (err) {
      throw new SnipError(err?.name === 'NotAllowedError' ? 'denied' : 'failed');
    }
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      throw new SnipError('failed');
    }
    return { stream, video };
  }

  /** One frame of the stream on a canvas. */
  async function takeFrame(video) {
    await new Promise((resolve) => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => resolve()) : setTimeout(resolve, SNIP_FRAME_FALLBACK)));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas;
  }

  /** The windows that are visible, the top one first, as rectangles on the screen. */
  function windowRects() {
    return [...wm.stack]
      .reverse()
      .map((id) => wm.get(id))
      .filter((win) => win && !win.minimized && win.desktop === wm.desktop)
      .map((win) => ({ title: win.title, rect: win.el.getBoundingClientRect() }));
  }

  /** The picture of a part of the frame (CSS pixels of the screen -> pixels of the frame). */
  function crop(frame, x, y, w, hh) {
    const scale = frame.width / window.innerWidth;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(hh * scale));
    out.getContext('2d').drawImage(frame, Math.round(x * scale), Math.round(y * scale), out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  function cropFree(frame, points) {
    const scale = frame.width / window.innerWidth;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.max(0, Math.min(...xs));
    const y = Math.max(0, Math.min(...ys));
    const w = Math.min(window.innerWidth, Math.max(...xs)) - x;
    const hh = Math.min(window.innerHeight, Math.max(...ys)) - y;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(hh * scale));
    const c = out.getContext('2d');
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo((p.x - x) * scale, (p.y - y) * scale) : c.moveTo((p.x - x) * scale, (p.y - y) * scale)));
    c.closePath();
    c.clip();
    c.drawImage(frame, Math.round(x * scale), Math.round(y * scale), out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  /** Show the frozen frame and let the user choose. Resolves a data URL, or null when cancelled. */
  function select(frame, mode) {
    return new Promise((resolve) => {
      const backdrop = h('canvas', { class: 'snip-backdrop', width: frame.width, height: frame.height });
      backdrop.getContext('2d').drawImage(frame, 0, 0);
      const dim = h('canvas', { class: 'snip-dim' });
      const bar = h('div', { class: 'snip-bar', role: 'toolbar', 'aria-label': t('screenshot.title') });
      const layer = h('div', { class: 'snip', tabIndex: -1 }, backdrop, dim, bar);
      document.body.append(layer);
      layer.focus({ preventScroll: true });

      const ratio = window.devicePixelRatio || 1;
      dim.width = Math.round(window.innerWidth * ratio);
      dim.height = Math.round(window.innerHeight * ratio);
      const ctx = dim.getContext('2d');
      ctx.scale(ratio, ratio);

      let current = mode;
      let drag = null; // { x, y } where a rectangle started, or the points of a freehand shape
      let hover = null; // the window under the pointer

      const finish = (result) => {
        layer.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(result);
      };

      /** Dim everything except the shape. `paint` cuts the hole. */
      const paint = (cut) => {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.fillStyle = 'rgba(0, 0, 0, .45)';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        if (!cut) return;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        cut(ctx);
        ctx.restore();
      };
      const outline = (rect) => {
        ctx.strokeStyle = SNIP_OUTLINE_COLOR;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.setLineDash([]);
      };
      const rectOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

      const render = () => paint();
      const showRect = (rect) => {
        paint((c) => c.fillRect(rect.x, rect.y, rect.w, rect.h));
        outline(rect);
      };

      const setMode = (mode2) => {
        current = mode2;
        drag = null;
        hover = null;
        render();
        for (const b of bar.querySelectorAll('[data-mode]')) b.classList.toggle('is-active', b.dataset.mode === mode2);
        layer.dataset.mode = mode2;
        if (mode2 === 'full') finish(crop(frame, 0, 0, window.innerWidth, window.innerHeight));
      };

      for (const m of MODES) {
        const b = h('button', { class: 'snip-btn', type: 'button', 'data-mode': m }, t(`screenshot.modes.${m}`));
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        b.addEventListener('click', () => setMode(m));
        bar.append(b);
      }
      const close = h('button', { class: 'snip-btn snip-close', type: 'button', 'aria-label': t('common.close') }, '×');
      close.addEventListener('pointerdown', (e) => e.stopPropagation());
      close.addEventListener('click', () => finish(null));
      bar.append(close);

      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
      };
      document.addEventListener('keydown', onKey, true);

      layer.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const p = { x: e.clientX, y: e.clientY };
        if (current === 'rect') drag = p;
        else if (current === 'free') drag = [p];
        else if (current === 'window' && hover) return finish(crop(frame, hover.rect.left, hover.rect.top, hover.rect.width, hover.rect.height));
        try {
          layer.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      });
      layer.addEventListener('pointermove', (e) => {
        const p = { x: e.clientX, y: e.clientY };
        if (current === 'rect' && drag) showRect(rectOf(drag, p));
        else if (current === 'free' && drag) {
          drag.push(p);
          paint((c) => {
            c.beginPath();
            drag.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
            c.closePath();
            c.fill();
          });
          ctx.strokeStyle = SNIP_OUTLINE_COLOR;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          drag.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
          ctx.stroke();
        } else if (current === 'window') {
          const found = windowRects().find(({ rect }) => p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom) ?? null;
          if (found?.rect !== hover?.rect) {
            hover = found;
            if (found) showRect({ x: found.rect.left, y: found.rect.top, w: found.rect.width, h: found.rect.height });
            else render();
          }
        }
      });
      layer.addEventListener('pointerup', (e) => {
        if (current === 'rect' && drag) {
          const rect = rectOf(drag, { x: e.clientX, y: e.clientY });
          drag = null;
          if (rect.w < MIN_SIDE || rect.h < MIN_SIDE) return render();
          finish(crop(frame, rect.x, rect.y, rect.w, rect.h));
        } else if (current === 'free' && drag) {
          const points = drag;
          drag = null;
          if (points.length < 3) return render();
          finish(cropFree(frame, points));
        }
      });
      setMode(mode);
      if (mode !== 'full') bar.querySelector(`[data-mode="${mode}"]`)?.focus({ preventScroll: true });
    });
  }

  /** A small counter while waiting. */
  function countdown(seconds) {
    const el = h('div', { class: 'snip-count' }, String(seconds));
    document.body.append(el);
    let left = seconds;
    const timer = setInterval(() => {
      left--;
      if (left > 0) el.textContent = String(left);
    }, SNIP_COUNTDOWN_TICK);
    return () => {
      clearInterval(timer);
      el.remove();
    };
  }

  /**
   * Take a snip. `owner` is the window that asked: it steps aside and comes back.
   * Resolves { image } (a PNG data URL) or null when cancelled.
   */
  async function start({ mode = 'rect', delay = 0 } = {}, owner = null) {
    if (busy) return null;
    busy = true;
    const requester = owner ? wm.get(owner) : null;
    let session = null;
    try {
      session = await openStream();
      if (requester) wm.minimize(requester.id);
      shell.flyouts.close();
      const stopCount = delay > 0 ? countdown(delay) : null;
      await sleep(350 + delay * 1000 - (delay > 0 ? 150 : 0));
      stopCount?.();
      await sleep(delay > 0 ? 150 : 0);
      const frame = await takeFrame(session.video);
      session.stream.getTracks().forEach((track) => track.stop());
      session = null;
      const image = await select(frame, MODES.includes(mode) ? mode : 'rect');
      return image ? { image } : null;
    } finally {
      session?.stream.getTracks().forEach((track) => track.stop());
      if (requester && wm.get(requester.id)) wm.activate(requester.id);
      busy = false;
    }
  }

  return { start };
}
