import { Emitter } from '../core/events.js';
import { FsError, ROOT_PATH, normalize, join, dirname, basename, isInside } from '../core/fs.js';
import { SYNC_ERRORS } from '../config/fs.js';

/**
 * The disk as an app page sees it. The real disk is in the shell; this page
 * keeps a copy of the folder tree (names, sizes, dates, addresses of pictures,
 * no content) so that looking around stays synchronous, and asks the shell for
 * everything that needs file content or changes something. The shell announces
 * every change before it answers the call that caused it, so the copy is
 * already up to date when `await fs.mkdir(...)` returns.
 *
 *   sync:   stat exists isDir isFile list sizeOf count search recent uniqueName usage
 *           trashList trashCount resolve
 *   async:  readFile readData writeFile writeLink mkdir remove rename move copy
 *           trash restore purge emptyTrash wipe flush
 */
const key = (path) => path.toLowerCase();

export class RemoteFs extends Emitter {
  FsError = FsError;
  ready = Promise.resolve();

  #call;
  #dirs = new Map(); // lower-case folder path -> entries of that folder
  #root = null;
  #trash = [];
  #usage = { used: 0, capacity: 0, free: 0 };
  persistent = true;

  constructor(call, snapshot) {
    super();
    this.#call = async (method, params) => {
      try {
        return await call(method, params);
      } catch (err) {
        // a disk error comes back with its code; make it an FsError again
        if (err && SYNC_ERRORS.has(err.code)) throw new FsError(err.code, err.path ?? '');
        throw err;
      }
    };
    this.load(snapshot);
  }

  /** Take over a whole snapshot of the disk. */
  load(snapshot) {
    this.#dirs = new Map(Object.entries(snapshot.dirs));
    this.#root = snapshot.root;
    this.#trash = snapshot.trash ?? [];
    this.#usage = snapshot.usage ?? this.#usage;
    this.persistent = snapshot.persistent !== false;
  }

  /** The shell says what changed: new lists for some folders, the Recycle Bin, the space used. */
  apply({ full, subtrees = [], removed = [], trash, usage, persistent, paths = null, external = false }) {
    if (full) this.load(full);
    for (const path of removed) this.#forget(path);
    for (const tree of subtrees) {
      this.#forget(tree.path);
      for (const [dir, entries] of Object.entries(tree.dirs)) this.#dirs.set(dir, entries);
    }
    if (trash) this.#trash = trash;
    if (usage) this.#usage = usage;
    if (persistent !== undefined) this.persistent = persistent;
    this.emit('change', { paths, trash: !!trash, external });
  }

  #forget(path) {
    const base = key(path);
    for (const dir of [...this.#dirs.keys()]) if (dir === base || dir.startsWith(`${base}/`)) this.#dirs.delete(dir);
  }

  get capacity() {
    return this.#usage.capacity;
  }

  init() {
    return this.ready;
  }

  /* ---------------------------------- reading -------------------------------- */

  resolve(path, cwd) {
    try {
      return normalize(path, cwd);
    } catch {
      return null;
    }
  }

  stat(path) {
    const full = this.resolve(path);
    if (!full) return null;
    if (full === ROOT_PATH) return this.#root ? { ...this.#root } : null;
    const entry = this.#dirs.get(key(dirname(full)))?.find((e) => key(e.name) === key(basename(full)));
    return entry ? { ...entry } : null;
  }

  exists(path) {
    return this.stat(path) !== null;
  }

  isDir(path) {
    return this.stat(path)?.type === 'dir';
  }

  isFile(path) {
    return this.stat(path)?.type === 'file';
  }

  #listing(path) {
    const full = normalize(path);
    const entries = this.#dirs.get(key(full));
    if (!entries) throw new FsError(this.stat(full) ? 'ENOTDIR' : 'ENOENT', full);
    return { path: this.stat(full)?.path ?? full, entries };
  }

  list(path) {
    return this.#listing(path).entries.map((entry) => ({ ...entry }));
  }

  sizeOf(path) {
    const entry = this.stat(path);
    if (!entry) throw new FsError('ENOENT', path);
    if (entry.type === 'file') return entry.size ?? 0;
    let total = 0;
    for (const child of this.#dirs.get(key(entry.path)) ?? []) total += this.sizeOf(child.path);
    return total;
  }

  count(path) {
    const { entries } = this.#listing(path);
    let files = 0;
    let folders = 0;
    const walk = (list) => {
      for (const child of list) {
        if (child.type === 'dir') {
          folders++;
          walk(this.#dirs.get(key(child.path)) ?? []);
        } else files++;
      }
    };
    walk(entries);
    return { files, folders };
  }

  search(base, query, { limit = 200 } = {}) {
    const needle = String(query).trim().toLowerCase();
    const out = [];
    if (!needle) return out;
    let start;
    try {
      start = this.#listing(base);
    } catch {
      return out;
    }
    const walk = (entries) => {
      for (const child of entries) {
        if (out.length >= limit) return;
        if (child.name.toLowerCase().includes(needle)) out.push({ ...child });
        if (child.type === 'dir') walk(this.#dirs.get(key(child.path)) ?? []);
      }
    };
    walk(start.entries);
    return out;
  }

  recent(base, limit = 6) {
    const out = [];
    let start;
    try {
      start = this.#listing(base);
    } catch {
      return out;
    }
    const walk = (entries) => {
      for (const child of entries) {
        if (child.type === 'dir') walk(this.#dirs.get(key(child.path)) ?? []);
        else out.push({ ...child });
      }
    };
    walk(start.entries);
    return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
  }

  uniqueName(dir, desired) {
    const names = new Set(this.#listing(dir).entries.map((e) => key(e.name)));
    if (!names.has(key(desired))) return desired;
    const dot = desired.lastIndexOf('.');
    const base = dot > 0 ? desired.slice(0, dot) : desired;
    const ext = dot > 0 ? desired.slice(dot) : '';
    for (let i = 2; ; i++) {
      const candidate = `${base} (${i})${ext}`;
      if (!names.has(key(candidate))) return candidate;
    }
  }

  usage() {
    const { used, capacity } = this.#usage;
    return { used, capacity, free: Math.max(0, capacity - used) };
  }

  trashList() {
    return this.#trash.map((item) => ({ ...item }));
  }

  trashCount() {
    return this.#trash.length;
  }

  /* ---------------------------------- changing ------------------------------- */

  readFile(path) {
    return this.#call('fs.readFile', { path });
  }

  /** The data URL of a picture, which a page can draw on a canvas (the address in an entry cannot be, from another origin). */
  readData(path) {
    return this.#call('fs.readData', { path });
  }

  writeFile(path, content = '', options = {}) {
    return this.#call('fs.writeFile', { path, content, options });
  }

  writeLink(path, href, size = 0) {
    return this.#call('fs.writeLink', { path, href, size });
  }

  mkdir(path, options = {}) {
    return this.#call('fs.mkdir', { path, options });
  }

  remove(path, options = {}) {
    return this.#call('fs.remove', { path, options });
  }

  rename(path, newName) {
    return this.#call('fs.rename', { path, newName });
  }

  move(path, destDir, options = {}) {
    return this.#call('fs.move', { path, destDir, options });
  }

  copy(path, destDir, options = {}) {
    return this.#call('fs.copy', { path, destDir, options });
  }

  trash(path) {
    return this.#call('fs.trash', { path });
  }

  restore(id) {
    return this.#call('fs.restore', { id });
  }

  purge(id) {
    return this.#call('fs.purge', { id });
  }

  emptyTrash() {
    return this.#call('fs.emptyTrash', {});
  }

  flush() {
    return this.#call('fs.flush', {});
  }

  /** Erase the disk for good (Reset this PC). */
  wipe() {
    return this.#call('fs.wipe', {});
  }
}

export { isInside, join };
