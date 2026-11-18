/**
 * Keeps the language and the theme of the OS equal to those of the other webs
 * of this site, which keep them in two plain localStorage keys (SHARED_KEYS).
 * Only the shell runs this; app pages get their settings from the shell.
 */
import { SHARED_KEYS } from '../config/storage.js';
import { settings } from './settings.js';

const read = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    if (window.localStorage.getItem(key) !== value) window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: nothing to share */
  }
};

/** A shared value becomes a setting; `light` and `dark` are the only themes the other webs know. */
function follow(setting, value) {
  if (setting === 'theme' && value !== 'light' && value !== 'dark') return;
  if (setting === 'language' && !value) return;
  if (settings.get(setting) !== value) settings.set(setting, value);
}

export function syncShared() {
  for (const setting of Object.keys(SHARED_KEYS)) follow(setting, read(SHARED_KEYS[setting]));

  // The other webs changed something.
  window.addEventListener('storage', (event) => {
    for (const setting of Object.keys(SHARED_KEYS)) {
      if (event.key === SHARED_KEYS[setting]) follow(setting, event.newValue);
    }
  });

  // The OS changed something. "system" (follow the device) stays inside the OS.
  settings.watch('language', (code) => write(SHARED_KEYS.language, code));
  settings.watch('theme', (value) => {
    if (value === 'light' || value === 'dark') write(SHARED_KEYS.theme, value);
  });
}
