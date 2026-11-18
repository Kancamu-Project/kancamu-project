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
  widgetNotes: 'widgets.notes',
  fsLegacy: 'fs',
  fsLegacyRevision: 'fs.rev'
});
