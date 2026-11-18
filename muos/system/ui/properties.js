import { h } from '../core/dom.js';
import { fs, dirname } from '../core/fs.js';
import { apps } from '../core/apps.js';
import { iconFor, typeLabel, openersFor } from '../core/filetypes.js';
import { formatBytes, formatDateTime } from '../core/format.js';
import { i18n, t } from '../core/i18n.js';
import { showDialog } from './dialog.js';

const sizeText = (bytes) => (bytes < 1024 ? formatBytes(bytes) : `${formatBytes(bytes)} (${i18n.plural('common.bytes', bytes)})`);

/** The Properties dialog of a file or folder of the virtual disk (an entry from `fs.stat`). */
export function showEntryProperties(entry) {
  const rows = [];
  const add = (label, value) => rows.push(h('dt', null, label), h('dd', null, value));
  const isDir = entry.type === 'dir';

  add(t('files.columns.type'), typeLabel(entry));
  if (!isDir) {
    const opener = openersFor(entry, apps)[0];
    if (opener) add(t('properties.opensWith'), apps.name(opener));
  }
  add(t('properties.location'), dirname(entry.path));
  if (isDir) {
    const { files, folders } = fs.count(entry.path);
    add(t('files.columns.size'), sizeText(fs.sizeOf(entry.path)));
    add(t('properties.contains'), t('properties.containsValue', { files: i18n.number(files), folders: i18n.number(folders) }));
  } else {
    add(t('files.columns.size'), sizeText(entry.size));
  }
  add(t('properties.created'), formatDateTime(entry.ctime));
  add(t('files.columns.modified'), formatDateTime(entry.mtime));

  return showDialog({
    title: t('properties.title', { name: entry.name }),
    content: h('div', null, h('div', { class: 'props-head' }, h('img', { src: iconFor(entry, { thumbnail: true }), alt: '' }), h('span', null, entry.name)), h('dl', { class: 'props' }, rows))
  });
}
