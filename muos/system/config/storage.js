/**
 * The browser storage the OS uses.
 * Values of the OS code live in system/config/; the code only uses them.
 */

/** Every key the OS writes to localStorage starts with this. */
export const PREFIX = 'webos:';

/** Every key the OS keeps in the browser storage (without the prefix). */
export const STORAGE_KEYS = Object.freeze({
  settings: 'settings',
  clipboard: 'clipboard',
  clipboardHistory: 'clipboard.history',
  widgetNotes: 'widgets.notes'
});

/**
 * Keys shared with the other webs of this site (same origin, no prefix):
 * the language and the theme chosen in any web are followed by all of them.
 */
export const SHARED_KEYS = Object.freeze({
  language: 'lang',
  theme: 'theme'
});
