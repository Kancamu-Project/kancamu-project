import { KNOWN_FOLDERS, extname } from './fs.js';
import { iconUrl } from './dom.js';
import { i18n } from './i18n.js';
import { TEXT_EXTENSIONS as TEXT, IMAGE_EXTENSIONS as IMAGE, AUDIO_EXTENSIONS as AUDIO, VIDEO_EXTENSIONS as VIDEO } from '../config/files.js';

const KNOWN_ICONS = Object.fromEntries(Object.entries(KNOWN_FOLDERS).map(([key, path]) => [path.toLowerCase(), `folder-${key}`]));

/** True for names whose extension says "plain text" (txt, md, json, js, css ...). */
export const isTextName = (name) => TEXT.has(extname(name));

/** 'folder' | 'text' | 'image' | 'audio' | 'video' | 'file' */
export function kindOf(entry) {
  if (entry.type === 'dir') return 'folder';
  const ext = entry.ext ?? extname(entry.name);
  if (IMAGE.has(ext)) return 'image';
  if (AUDIO.has(ext)) return 'audio';
  if (VIDEO.has(ext)) return 'video';
  if (TEXT.has(ext)) return 'text';
  return 'file';
}

/** True when the file can be shown as text (everything that is not a linked picture). */
export function isTextual(entry) {
  return entry.type === 'file' && !entry.url;
}

/** Name of the colour icon in /icons that represents the entry. */
export function iconNameFor(entry) {
  const kind = kindOf(entry);
  if (kind === 'folder') return (entry.path && KNOWN_ICONS[entry.path.toLowerCase()]) || 'c-folder';
  if (kind === 'text') return 'file-text';
  if (kind === 'image') return 'file-image';
  if (kind === 'audio') return 'file-audio';
  if (kind === 'video') return 'file-video';
  return 'c-file';
}

/**
 * URL of the picture to show for an entry. With `thumbnail`, pictures show
 * themselves instead of the generic picture icon.
 */
export function iconFor(entry, { thumbnail = false } = {}) {
  if (thumbnail && entry.url && kindOf(entry) === 'image') return entry.url;
  return iconUrl(iconNameFor(entry));
}

/** "File folder", "Text Document", "WEBP File" ... */
export function typeLabel(entry) {
  const kind = kindOf(entry);
  if (kind === 'folder') return i18n.t('filetypes.folder');
  const ext = entry.ext ?? extname(entry.name);
  if (ext === 'txt') return i18n.t('filetypes.text');
  if (!ext) return i18n.t('filetypes.file');
  return i18n.t('filetypes.generic', { ext: ext.toUpperCase() });
}

/**
 * The installed apps that can open an entry, the default first ("Open with").
 * `registry` is the app registry (`apps`); it is passed in so this module stays free of it.
 */
export function openersFor(entry, registry) {
  const kind = kindOf(entry);
  let roles;
  if (kind === 'folder') roles = ['file-manager'];
  else if (kind === 'image' && entry.url) roles = ['image-viewer', 'paint'];
  else if ((kind === 'audio' || kind === 'video') && entry.url) roles = ['media-player'];
  else roles = ['text-editor'];
  const found = roles.map((role) => registry.byRole(role)).filter(Boolean);
  return [...new Map(found.map((app) => [app.id, app])).values()];
}
