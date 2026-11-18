import { fs, join } from './fs.js';
import { isTextName } from './filetypes.js';

/**
 * Copy files and folders from the user's computer (dropped on a window) onto
 * the virtual disk.
 *
 *   // inside the drop event handler - the browser invalidates the items afterwards:
 *   const items = takeDropped(event.dataTransfer);
 *   const { created, skipped } = await importDropped(items, 'C:/Users/Kanca/Documents');
 *
 * Text files are stored as text, everything else (pictures, audio, video,
 * documents ...) as data that keeps its original bytes. A name that is taken
 * becomes "name (2).ext". Folders are copied with everything in them.
 */

/** Characters that a file name cannot hold are replaced. */
const clean = (name) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim() || 'file';

/**
 * Take the dropped items synchronously. Returns File objects and, for
 * browsers that can read folders, directory entries.
 */
export function takeDropped(dataTransfer) {
  const items = [];
  for (const item of dataTransfer.items ?? []) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) items.push(entry);
    else if (item.getAsFile()) items.push(item.getAsFile());
  }
  if (!items.length) items.push(...(dataTransfer.files ?? []));
  return items;
}

/** The base64 data URL of a file. */
async function toDataURL(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${file.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

const isText = (file, name) => isTextName(name) || /^text\//.test(file.type) || /(json|xml|javascript)$/.test(file.type);

function readAll(reader) {
  return new Promise((resolve, reject) => {
    const all = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

const fileOf = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));

/**
 * @param {Array<File | FileSystemEntry>} items from takeDropped()
 * @param {string} destDir folder on the virtual disk
 * @returns {Promise<{created: string[], skipped: Array<{name: string, reason: 'noSpace' | 'error', size?: number, free?: number, error?: Error}>}>}
 *   `created` holds the new top-level files and folders.
 */
export async function importDropped(items, destDir) {
  const created = [];
  const skipped = [];

  async function importFile(file, dir, top) {
    // no size limit of our own: a file is taken when it still fits in what the disk has left
    const { free } = fs.usage();
    if (file.size > free) return skipped.push({ name: file.name, reason: 'noSpace', size: file.size, free });
    try {
      const name = clean(file.name);
      const path = join(dir, fs.uniqueName(dir, name));
      let made;
      if (isText(file, name)) made = await fs.writeFile(path, await file.text(), { exclusive: true });
      else made = await fs.writeLink(path, await toDataURL(file), file.size);
      if (top) created.push(made);
    } catch (error) {
      skipped.push({ name: file.name, reason: 'error', error });
    }
  }

  async function visit(item, dir, top) {
    if (typeof File !== 'undefined' && item instanceof File) return importFile(item, dir, top);
    if (item.isFile) return importFile(await fileOf(item), dir, top);
    if (!item.isDirectory) return undefined;
    let target;
    try {
      target = await fs.mkdir(join(dir, fs.uniqueName(dir, clean(item.name))));
    } catch (error) {
      return skipped.push({ name: item.name, reason: 'error', error });
    }
    if (top) created.push(target);
    for (const child of await readAll(item.createReader())) await visit(child, target, false);
    return undefined;
  }

  for (const item of items) await visit(item, destDir, true);
  return { created, skipped };
}
