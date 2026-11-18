import { h, clamp } from '../core/dom.js';
import { settings } from '../core/settings.js';
import { fs } from '../core/fs.js';
import { resolveWallpaper, wallpaperBackground, deviceTheme, WALLPAPER_KEYS } from '../core/system.js';
import { WALLPAPER_FADE } from '../config/shell.js';

/** Paints the wallpaper and applies the brightness / night light overlays. */
export function createDisplay() {
  const wall = document.getElementById('wallpaper');
  const dim = document.getElementById('fx-dim');
  const night = document.getElementById('fx-night');
  let current = '';

  function applyWallpaper() {
    const background = wallpaperBackground();
    if (background === current) return;
    current = background;
    const first = !wall.firstChild;
    const layer = h('div', { class: 'wallpaper-layer' });
    layer.style.background = background;
    wall.append(layer);
    if (first) {
      layer.style.transition = 'none'; // nothing to fade from
    } else {
      layer.getBoundingClientRect(); // commit opacity 0 so the cross-fade has a start
    }
    layer.classList.add('is-visible');
    setTimeout(() => {
      while (wall.firstChild && wall.firstChild !== layer) wall.firstChild.remove();
    }, WALLPAPER_FADE);
  }

  function applyEffects() {
    const brightness = clamp(Number(settings.get('brightness')) || 100, 10, 100);
    dim.style.opacity = String(((100 - brightness) / 100) * 0.78);
    night.classList.toggle('is-on', !!settings.get('nightLight'));
  }

  /** Resolves once the current wallpaper picture has been downloaded. */
  function preload() {
    const info = resolveWallpaper();
    if (info.type !== 'image') return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => resolve();
      img.src = info.url;
    });
  }

  settings.on('change', (key) => {
    if (WALLPAPER_KEYS.has(key)) applyWallpaper();
    if (key === 'brightness' || key === 'nightLight') applyEffects();
  });
  deviceTheme.on('change', applyWallpaper); // the device switched between light and dark
  fs.on('change', applyWallpaper); // the picture in use may have been deleted

  applyWallpaper();
  applyEffects();

  return { preload };
}
