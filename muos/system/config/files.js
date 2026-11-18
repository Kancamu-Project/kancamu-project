/**
 * File types, sizes and the drag-and-drop format.
 * Values of the OS code live in system/config/; the code only uses them.
 */

/** MIME type used when files of the virtual disk are dragged between windows. */
export const DRAG_TYPE = 'application/x-webos-paths';

/** The largest file that is made ready as a real file for a drag out to a page of another address (bytes). */
export const DRAG_FILE_MAX_BYTES = 25 * 1024 * 1024;

/** MIME types given to the real files of a drag out (by extension); anything else is application/octet-stream. */
export const MIME_TYPES = Object.freeze({
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  htm: 'text/html',
  xml: 'application/xml',
  css: 'text/css',
  js: 'text/javascript',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif'
});
export const DEFAULT_MIME_TYPE = 'application/octet-stream';

export const TEXT_EXTENSIONS = new Set(['txt', 'md', 'log', 'json', 'js', 'css', 'html', 'htm', 'xml', 'csv', 'ini', 'bat', 'cmd', 'yml', 'yaml', 'cfg', 'conf']);

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);

export const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a']);

export const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mkv', 'mov', 'avi']);

export const SIZE_UNITS = ['KB', 'MB', 'GB'];
