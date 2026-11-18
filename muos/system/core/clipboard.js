import { Emitter } from './events.js';
import { readJSON, writeJSON, removeKey, onExternalChange } from './store.js';
import { fs, FsError, dirname } from './fs.js';
import { DRAG_TYPE, DRAG_FILE_MAX_BYTES, MIME_TYPES, DEFAULT_MIME_TYPE } from '../config/files.js';
import { STORAGE_KEYS } from '../config/storage.js';
export { DRAG_TYPE } from '../config/files.js';

/**
 * Clipboard for files and folders (cut / copy / paste). It is shared by the
 * desktop and all File Explorer windows.
 */
class FileClipboard extends Emitter {
  constructor() {
    super();
    onExternalChange(STORAGE_KEYS.clipboard, () => this.emit('change'));
  }

  #remote = null; // in an app page: { send, data }

  /**
   * Inside an app page the clipboard of files lives in the shell. `send(message)`
   * tells it about a change, `apply(data)` takes what the shell announces.
   */
  attach(data, send) {
    this.#remote = { send, data };
  }

  apply(data) {
    if (this.#remote) this.#remote.data = data;
    this.emit('change');
  }

  /** @returns {{op: 'copy'|'cut', paths: string[]} | null} */
  get() {
    const data = this.#remote ? this.#remote.data : readJSON(STORAGE_KEYS.clipboard, null);
    return data && Array.isArray(data.paths) && data.paths.length ? data : null;
  }

  set(op, paths) {
    if (this.#remote) {
      this.#remote.data = { op, paths: [...paths] };
      this.#remote.send({ set: this.#remote.data });
    } else {
      try {
        writeJSON(STORAGE_KEYS.clipboard, { op, paths: [...paths] });
      } catch {
        /* ignore */
      }
    }
    this.emit('change');
  }

  clear() {
    if (this.#remote) {
      this.#remote.data = null;
      this.#remote.send({ clear: true });
    } else removeKey(STORAGE_KEYS.clipboard);
    this.emit('change');
  }

  isCut(path) {
    const data = this.get();
    return !!data && data.op === 'cut' && data.paths.includes(path);
  }

  /** True when there is something that still exists to paste. */
  canPaste() {
    const data = this.get();
    return !!data && data.paths.some((path) => fs.exists(path));
  }

  /**
   * Paste into `destDir`. Returns the new paths and the errors that happened.
   * @returns {{created: string[], errors: FsError[]}}
   */
  async pasteInto(destDir) {
    const data = this.get();
    const created = [];
    const errors = [];
    if (!data) return { created, errors };
    for (const path of data.paths) {
      try {
        created.push(await transfer(path, destDir, data.op === 'copy'));
      } catch (err) {
        if (err instanceof FsError) errors.push(err);
        else throw err;
      }
    }
    if (data.op === 'cut') this.clear();
    return { created, errors };
  }
}

/**
 * Move or copy one item into a folder. Moving something into the folder it is
 * already in is a no-op; a name clash on move keeps both by renaming the newcomer.
 */
export async function transfer(path, destDir, copy) {
  if (copy) return fs.copy(path, destDir);
  if (dirname(path).toLowerCase() === destDir.toLowerCase()) return path;
  try {
    return await fs.move(path, destDir);
  } catch (err) {
    if (err instanceof FsError && err.code === 'EEXIST') {
      const entry = fs.stat(path);
      return await fs.move(path, destDir, { name: fs.uniqueName(destDir, entry.name) });
    }
    throw err;
  }
}

export const clipboard = new FileClipboard();

/* ------------------------------ drag and drop ------------------------------ */

/*
 * A page of another address (a web app, WordCraft ...) does not know the paths of this disk; it only
 * takes real files out of a drop. A drag has to say what it carries the moment it starts, before
 * anything can be read, so the files of what is selected are made ready beforehand (prepareDragFiles).
 */
const readyFiles = new Map(); // path -> { stamp, file }

async function makeFile(entry) {
  const type = MIME_TYPES[entry.ext] ?? DEFAULT_MIME_TYPE;
  if (entry.url) {
    const blob = await (await fetch(entry.url)).blob();
    return new File([blob], entry.name, { type: blob.type || type });
  }
  return new File([await fs.readFile(entry.path)], entry.name, { type });
}

/** Make real files of the selected entries ready for a drag (the ones before are forgotten). */
export function prepareDragFiles(entries) {
  const wanted = new Set();
  for (const entry of entries) {
    if (entry.type !== 'file' || entry.size > DRAG_FILE_MAX_BYTES) continue;
    wanted.add(entry.path);
    const held = readyFiles.get(entry.path);
    if (held && held.stamp === entry.mtime) continue;
    const slot = { stamp: entry.mtime, file: null };
    readyFiles.set(entry.path, slot);
    makeFile(entry).then(
      (file) => (slot.file = file),
      () => readyFiles.delete(entry.path)
    );
  }
  for (const path of [...readyFiles.keys()]) if (!wanted.has(path)) readyFiles.delete(path);
}

export function setDragPaths(event, paths) {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(paths));
  event.dataTransfer.effectAllowed = 'copyMove';
  // the same files as real ones, for a page that takes files (and does not know DRAG_TYPE)
  for (const path of paths) {
    const file = readyFiles.get(path)?.file;
    if (file) event.dataTransfer.items.add(file);
  }
}

export function hasDragPaths(event) {
  return !!event.dataTransfer && Array.from(event.dataTransfer.types).includes(DRAG_TYPE);
}

export function getDragPaths(event) {
  try {
    const paths = JSON.parse(event.dataTransfer.getData(DRAG_TYPE) || '[]');
    return Array.isArray(paths) ? paths : [];
  } catch {
    return [];
  }
}

/**
 * Finish a drop: move (or copy with Ctrl) the dragged items into `destDir`.
 * @returns {{created: string[], errors: FsError[]}}
 */
export async function dropInto(event, destDir) {
  const created = [];
  const errors = [];
  for (const path of getDragPaths(event)) {
    try {
      created.push(await transfer(path, destDir, event.ctrlKey));
    } catch (err) {
      if (err instanceof FsError) errors.push(err);
      else throw err;
    }
  }
  return { created, errors };
}
