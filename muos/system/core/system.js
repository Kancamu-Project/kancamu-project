import { Emitter } from './events.js';
import { settings } from './settings.js';
import { fs } from './fs.js';
import { url } from './paths.js';
import { THEME_KEYS, THEME_FALLBACK, THEME_LIGHT_QUERY, THEME_DARK_QUERY, DEFAULT_WALLPAPERS, WALLPAPER_FIT as FIT, WALLPAPER_KEYS, NETWORK_KEYS, VOLUME_KEYS } from '../config/system.js';
export { DEFAULT_WALLPAPERS, WALLPAPER_KEYS, NETWORK_KEYS, VOLUME_KEYS } from '../config/system.js';

/**
 * Small pieces of system state that the shell and the apps both need:
 * theme, wallpaper, network, battery, volume.
 */

/* --------------------------------- theme ---------------------------------- */

/** Emits 'change' when the device switches between light and dark while the setting is 'system'. */
export const deviceTheme = new Emitter();

/** 'light' or 'dark': what the setting says, or what the device prefers, or the fallback when that is unknown. */
export function resolveTheme() {
  const chosen = settings.get('theme');
  if (chosen === 'light' || chosen === 'dark') return chosen;
  if (window.matchMedia?.(THEME_LIGHT_QUERY).matches) return 'light';
  if (window.matchMedia?.(THEME_DARK_QUERY).matches) return 'dark';
  return THEME_FALLBACK;
}

/** Copy the look-and-feel settings onto <html> so the CSS can react. */
export function applyTheme() {
  const root = document.documentElement;
  const saver = settings.get('energySaver');
  root.dataset.theme = resolveTheme();
  root.style.setProperty('--accent-base', settings.get('accent'));
  root.classList.toggle('no-transparency', !settings.get('transparency') || saver);
  root.classList.toggle('high-contrast', !!settings.get('highContrast'));
  root.classList.toggle('big-focus', !!settings.get('focusIndicator'));
  root.dataset.colorFilter = settings.get('colorFilter') || 'none';
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  root.classList.toggle('no-animations', !settings.get('animations') || saver || !!reduced);
}

// follow the system's "reduce motion" switch while the page is open
window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => applyTheme());
// and its light / dark switch
for (const query of [THEME_LIGHT_QUERY, THEME_DARK_QUERY]) {
  window.matchMedia?.(query).addEventListener?.('change', () => {
    applyTheme();
    deviceTheme.emit('change');
  });
}

/** Apply the theme now and keep it in sync with Settings. */
export function watchTheme() {
  applyTheme();
  return settings.on('change', (key) => {
    if (THEME_KEYS.has(key)) applyTheme();
  });
}

/* ------------------------------- wallpaper -------------------------------- */

/** What the desktop background currently is: a picture URL or a plain colour. */
export function resolveWallpaper() {
  const value = String(settings.get('wallpaper') || 'auto');
  if (value.startsWith('color:')) return { type: 'color', color: value.slice(6) };
  if (value.startsWith('file:')) {
    const entry = fs.stat(value.slice(5));
    if (entry?.url) return { type: 'image', url: entry.url };
  }
  return { type: 'image', url: url(DEFAULT_WALLPAPERS[resolveTheme()]) };
}

/** CSS `background` value for the current wallpaper. */
export function wallpaperBackground() {
  const info = resolveWallpaper();
  if (info.type === 'color') return info.color;
  return `#000 url("${info.url}") ${FIT[settings.get('wallpaperFit')] || FIT.fill}`;
}

/* -------------------------------- network --------------------------------- */

/** 'airplane' | 'offline' | 'wifi' */
export function networkState() {
  if (settings.get('airplane') && !settings.get('wifi')) return 'airplane';
  if (!settings.get('wifi') || navigator.onLine === false) return 'offline';
  return 'wifi';
}

export function networkIcon() {
  const state = networkState();
  return state === 'airplane' ? 'airplane' : state === 'offline' ? 'wifi-off' : 'wifi';
}

/** Airplane mode switches the radios off and remembers how they were. */
export function setAirplaneMode(on) {
  if (on) {
    settings.update({
      airplane: true,
      airplanePrev: { wifi: settings.get('wifi'), bluetooth: settings.get('bluetooth') },
      wifi: false,
      bluetooth: false
    });
  } else {
    const prev = settings.get('airplanePrev') || { wifi: true, bluetooth: false };
    settings.update({ airplane: false, airplanePrev: null, wifi: !!prev.wifi, bluetooth: !!prev.bluetooth });
  }
}

/* --------------------------------- volume --------------------------------- */

export function volumeIcon() {
  const volume = settings.get('volume');
  if (settings.get('muted') || volume <= 0) return 'volume-mute';
  if (volume < 34) return 'volume-1';
  if (volume < 67) return 'volume-2';
  return 'volume-3';
}

/* --------------------------------- battery -------------------------------- */

class Battery extends Emitter {
  supported = false;
  level = 1;
  charging = true;

  constructor() {
    super();
    this.#init();
  }

  async #init() {
    if (typeof navigator.getBattery !== 'function') return;
    try {
      const manager = await navigator.getBattery();
      const sync = () => {
        this.level = manager.level;
        this.charging = manager.charging;
        this.emit('change');
      };
      this.supported = true;
      manager.addEventListener('levelchange', sync);
      manager.addEventListener('chargingchange', sync);
      sync();
    } catch {
      /* not available: keep the "plugged in, full" default */
    }
  }

  get percent() {
    return Math.round(this.level * 100);
  }
}

export const battery = new Battery();

/** Small battery glyph that follows the real battery level. */
export function batteryIcon() {
  const level = document.createElement('span');
  level.className = 'battery-level';
  const el = document.createElement('span');
  el.className = 'battery';
  el.setAttribute('aria-hidden', 'true');
  el.append(level);
  const update = () => {
    el.style.setProperty('--level', String(battery.level));
    el.classList.toggle('is-charging', battery.charging && battery.supported);
    el.classList.toggle('is-low', !battery.charging && battery.level <= 0.2);
  };
  update();
  battery.on('change', update);
  return el;
}
