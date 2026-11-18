import { Emitter } from './events.js';
import { url } from './paths.js';
import { FS_VERSION as VERSION, SEP, ROOT_PATH, HOME, KNOWN_FOLDERS, TRASH, FALLBACK_CAPACITY, SAVE_DELAY, INVALID_NAME, WELCOME_TEXT as WELCOME, WELCOME_FILE, WELCOME_FOLDER, GUIDE_TEXT as GUIDE, GUIDE_FILE, DB_NAME } from '../config/fs.js';
import { STORAGE_KEYS } from '../config/storage.js';
import { DEFAULTS } from '../config/settings.js';
import { DEFAULT_WALLPAPERS } from '../config/system.js';
export { SEP, ROOT_PATH, HOME, KNOWN_FOLDERS, TRASH } from '../config/fs.js';

/**
 * Virtual file system.
 *
 * One drive (C:), paths with a drive letter and "/", case-insensitive names. All methods are
 * synchronous: the whole folder tree lives in memory and is saved to
 * IndexedDB in the background (the tree in one record, the data of pictures
 * in a separate store, so saving a change never rewrites a photo).
 *
 * The real files of the system (this project) are shown read-only in
 * C:/System and C:/Program Files (see `mount()`); they are not part of the
 * saved disk and do not use its space.
 *
 * There is exactly one real disk: the shell owns it. An app window never
 * touches it; the app SDK gives the page a remote copy of the folder tree
 * (system/sdk/remote-fs.js) and sends every change to the shell as a message,
 * so a page from another address works the same way.
 */

class DiskError extends Error {
  /**
   * @param {'ENOENT'|'EEXIST'|'ENOTDIR'|'EISDIR'|'ENOTEMPTY'|'EINVAL'|'EPERM'|'ENOSPC'|'ENODRIVE'} code
   */
  constructor(code, path = '') {
    super(`${code}: ${path}`);
    this.name = 'FsError';
    this.code = code;
    this.path = path;
  }
}

/** The error of every disk operation, in the shell and in the apps alike. */
export const FsError = DiskError;

/* ------------------------------ path helpers ------------------------------ */

export function isValidName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 255 &&
    name === name.trim() &&
    name !== '.' &&
    name !== '..' &&
    !name.endsWith('.') &&
    !INVALID_NAME.test(name)
  );
}

function segments(path) {
  return path.slice(3).split(SEP).filter(Boolean);
}

/**
 * Turn any user-supplied path into an absolute one ("C:/a/b").
 * Accepts "/" (or a typed backslash) as a separator, "." and "..", and paths relative to `cwd`.
 */
export function normalize(input, cwd = ROOT_PATH) {
  let p = String(input ?? '').trim();
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
  p = p.replace(/\\/g, SEP);

  let parts = [];
  const drive = /^([a-zA-Z]):/.exec(p);
  if (drive) {
    if (drive[1].toUpperCase() !== 'C') throw new FsError('ENODRIVE', `${drive[1].toUpperCase()}:`);
    p = p.slice(2);
    if (!p.startsWith(SEP)) parts = segments(cwd);
  } else if (!p.startsWith(SEP)) {
    parts = segments(cwd);
  }

  for (const part of p.split(SEP)) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.length ? ROOT_PATH + parts.join(SEP) : ROOT_PATH;
}

export function join(dir, name) {
  return dir.endsWith(SEP) ? dir + name : dir + SEP + name;
}

export function dirname(path) {
  const parts = segments(path);
  parts.pop();
  return parts.length ? ROOT_PATH + parts.join(SEP) : ROOT_PATH;
}

export function basename(path) {
  const parts = segments(path);
  return parts.length ? parts[parts.length - 1] : '';
}

/** Lower-case extension without the dot ("" when there is none). */
export function extname(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** True when `path` is `ancestor` itself or lives somewhere below it. */
export function isInside(path, ancestor) {
  const a = path.toLowerCase();
  const b = ancestor.toLowerCase();
  return a === b || a.startsWith(b.endsWith(SEP) ? b : b + SEP);
}

const encoder = new TextEncoder();
const byteLength = (text) => encoder.encode(text).length;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** Visit a node and everything below it. */
function eachNode(node, fn) {
  fn(node);
  if (node.type === 'dir') for (const child of Object.values(node.children)) eachNode(child, fn);
}

/* --------------------------------- seeding -------------------------------- */

function seed() {
  const now = Date.now();
  const dir = (name, children = [], extra = {}) => ({
    type: 'dir',
    name,
    ctime: now,
    mtime: now,
    children: Object.fromEntries(children.map((c) => [c.name.toLowerCase(), c])),
    ...extra
  });
  const file = (name, content) => ({ type: 'file', name, ctime: now, mtime: now, content, size: byteLength(content) });
  const link = (name, href, size) => ({ type: 'file', name, ctime: now, mtime: now, url: href, size });
  const sys = { system: true };

  return {
    root: dir(
      'C:',
      [
        dir('Program Files', [], sys),
        dir(
          'Users',
          [
            dir(
              DEFAULTS.userName,
              [
                dir('Desktop', [dir(WELCOME_FOLDER, [file(WELCOME_FILE, WELCOME), file(GUIDE_FILE, GUIDE)])], sys),
                dir('Documents', [], sys),
                dir('Downloads', [], sys),
                dir('Music', [], sys),
                dir(
                  'Pictures',
                  [
                    link(DEFAULT_WALLPAPERS.light.split('/').pop(), DEFAULT_WALLPAPERS.light, 132468),
                    link(DEFAULT_WALLPAPERS.dark.split('/').pop(), DEFAULT_WALLPAPERS.dark, 113312)
                  ],
                  sys
                ),
                dir('Videos', [], sys)
              ],
              sys
            )
          ],
          sys
        ),
        dir('System', [], { system: true, readonly: true })
      ],
      sys
    ),
    trash: []
  };
}

/* -------------------------------- IndexedDB -------------------------------- */

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('meta');
      req.result.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
}

function request(db, store, mode, run) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result;
    const req = run(t.objectStore(store));
    if (req) req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

const idbGet = (db, store, key) => request(db, store, 'readonly', (s) => s.get(key));
const idbPut = (db, store, key, value) => request(db, store, 'readwrite', (s) => s.put(value, key));
const idbDelete = (db, store, key) => request(db, store, 'readwrite', (s) => s.delete(key));
const idbClear = (db, store) => request(db, store, 'readwrite', (s) => s.clear());

function idbReadAll(db, store) {
  return new Promise((resolve, reject) => {
    const out = new Map();
    const t = db.transaction(store, 'readonly');
    t.objectStore(store).openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        out.set(cursor.key, cursor.value);
        cursor.continue();
      }
    };
    t.oncomplete = () => resolve(out);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

/* ------------------------------- file system ------------------------------ */

class FileSystem extends Emitter {
  FsError = DiskError;
  /** False when the browser refuses IndexedDB: the disk then lives in memory only. */
  persistent = false;
  /** Bytes the disk may hold (from the browser's storage quota). */
  capacity = FALLBACK_CAPACITY;
  ready = null;

  #data = null;
  #blobs = new Map(); // blob id -> data URL of a picture
  #db = null;
  #timer = 0;
  #rev = 0;
  #frozen = false;
  #channel = null;
  #objectUrls = new Map(); // blob id -> blob: address shown to the apps
  #mountIndex = null; // the list of the project files (system-files.json)

  /** Load the disk. Safe to call more than once. */
  init() {
    return (this.ready ??= this.#init());
  }

  async #init() {
    try {
      this.#db = await openDb();
      this.persistent = true;
    } catch (err) {
      console.warn('[fs] IndexedDB is not usable, the disk will not be saved', err);
    }

    let record = null;
    if (this.#db) {
      try {
        record = await idbGet(this.#db, 'meta', 'tree');
      } catch (err) {
        console.warn('[fs] the disk could not be read', err);
      }
    }

    if (record && record.version === VERSION && record.root) {
      this.#data = { root: record.root, trash: Array.isArray(record.trash) ? record.trash : [] };
      this.#rev = record.rev || 0;
      try {
        this.#blobs = await idbReadAll(this.#db, 'blobs');
      } catch (err) {
        console.warn('[fs] pictures could not be read', err);
      }
      this.#collectGarbage();
    } else {
      this.#data = seed();
      for (const [id, data] of this.#blobs) this.#putBlob(id, data);
      await this.flush();
    }

    await this.#loadMounts();
    this.#estimateCapacity();
    this.#listen();
  }

  /** Fetch the list of the system files and show them on the disk. A page that cannot do that simply has none. */
  async #loadMounts() {
    if (typeof XMLHttpRequest === 'undefined' || typeof fetch === 'undefined') return;
    try {
      const res = await fetch(url('system-files.json'), { cache: 'no-cache' });
      if (res.ok) this.mount(await res.json());
    } catch {
      /* no list: C:/System keeps only what the disk itself has */
    }
  }

  /**
   * Show the files of the system on the disk, read-only. `index.files` is a
   * list of [path on the disk, address on the server, size, 1 for a picture].
   * Texts are read from the server when they are opened. `read(address)` can
   * replace that reading (tests).
   */
  mount(index, { read } = {}) {
    this.#mountIndex = index;
    if (read) this.#mountRead = read;
    const built = index.built || Date.now();
    const lockUp = (node) => {
      node.readonly = true;
      node.system = true;
    };
    for (const [to, from, size, picture] of index.files ?? []) {
      let node = this.#data.root;
      const names = to.split('/');
      const name = names.pop();
      for (const part of names) {
        let next = node.children[part.toLowerCase()];
        if (!next) {
          next = { type: 'dir', name: part, ctime: built, mtime: built, children: {}, mount: true };
          node.children[part.toLowerCase()] = next;
        }
        lockUp(next);
        node = next;
      }
      const leaf = { type: 'file', name, ctime: built, mtime: built, size, mount: true, readonly: true, system: true };
      if (picture) leaf.url = from;
      else leaf.src = from;
      node.children[name.toLowerCase()] = leaf;
    }
  }

  #mountRead = null;

  /** The text of a system file, read once from the server. */
  #sourceText(node) {
    if (node.content === undefined) {
      let text = '';
      try {
        if (this.#mountRead) text = this.#mountRead(node.src);
        else {
          const request = new XMLHttpRequest();
          request.open('GET', url(node.src), false); // a small file of this very server: reading it right away keeps readFile() synchronous
          request.send();
          if (request.status >= 200 && request.status < 300) text = request.responseText;
        }
      } catch {
        /* the file cannot be read: it shows as empty */
      }
      node.content = text;
      node.size = byteLength(text);
    }
    return node.content;
  }

  async #estimateCapacity() {
    try {
      const { quota } = (await navigator.storage?.estimate?.()) ?? {};
      if (quota) this.capacity = quota; // whatever the browser says
      navigator.storage?.persist?.().catch(() => {});
    } catch {
      /* keep the fallback */
    }
  }

  #listen() {
    const save = () => this.flush();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());
    if (typeof BroadcastChannel === 'undefined' || !this.#db) return;
    this.#channel = new BroadcastChannel('webos-disk');
    this.#channel.onmessage = (e) => e.data?.rev > this.#rev && this.#reloadExternal();
  }

  /** Another tab saved the disk: take over its state. */
  async #reloadExternal() {
    try {
      const record = await idbGet(this.#db, 'meta', 'tree');
      if (!record || record.version !== VERSION || record.rev <= this.#rev) return;
      this.#blobs = await idbReadAll(this.#db, 'blobs');
      this.#data = { root: record.root, trash: record.trash ?? [] };
      this.#rev = record.rev;
      if (this.#mountIndex) this.mount(this.#mountIndex);
      this.emit('change', { paths: null, trash: true, external: true });
    } catch (err) {
      console.warn('[fs] the disk of another tab could not be read', err);
    }
  }

  #collectGarbage() {
    const used = new Set();
    const mark = (n) => n.blob && used.add(n.blob);
    eachNode(this.#data.root, mark);
    this.#data.trash.forEach((item) => eachNode(item.node, mark));
    for (const id of [...this.#blobs.keys()]) {
      if (used.has(id)) continue;
      this.#blobs.delete(id);
      this.#deleteBlob(id);
    }
  }

  /* ---- persistence ---- */

  #fail(err) {
    console.warn('[fs] saving failed', err);
    this.emit('error', err);
  }

  #putBlob(id, data) {
    if (this.#db && !this.#frozen) idbPut(this.#db, 'blobs', id, data).catch((err) => this.#fail(err));
  }

  #deleteBlob(id) {
    if (this.#db && !this.#frozen) idbDelete(this.#db, 'blobs', id).catch(() => {});
  }

  /** Write the folder tree now (otherwise it is written a moment after the last change). */
  async flush() {
    clearTimeout(this.#timer);
    this.#timer = 0;
    if (!this.#db || this.#frozen || !this.#data) return;
    const record = { version: VERSION, rev: ++this.#rev, root: FileSystem.#withoutMounts(this.#data.root), trash: this.#data.trash };
    try {
      await idbPut(this.#db, 'meta', 'tree', record);
      this.#channel?.postMessage({ rev: this.#rev });
    } catch (err) {
      this.#fail(err);
    }
  }

  /** Erase the disk for good (Reset this PC). The page must be reloaded afterwards. */
  async wipe() {
    this.#frozen = true;
    clearTimeout(this.#timer);
    if (!this.#db) return;
    await idbClear(this.#db, 'meta');
    await idbClear(this.#db, 'blobs');
  }

  #commit(paths, trash = false) {
    if (this.#db && !this.#frozen) {
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.flush(), SAVE_DELAY);
    }
    this.emit('change', { paths, trash, external: false });
  }

  /* ---- lookup ---- */

  /** @returns {{node: object, path: string, readonly: boolean} | null} */
  #lookup(path) {
    let node = this.#data.root;
    let readonly = !!node.readonly;
    const names = [];
    for (const part of segments(path)) {
      if (node.type !== 'dir') return null;
      node = node.children[part.toLowerCase()];
      if (!node) return null;
      names.push(node.name);
      if (node.readonly) readonly = true;
    }
    return { node, path: names.length ? ROOT_PATH + names.join(SEP) : ROOT_PATH, readonly };
  }

  #dir(path) {
    const found = this.#lookup(path);
    if (!found) throw new FsError('ENOENT', path);
    if (found.node.type !== 'dir') throw new FsError('ENOTDIR', path);
    return found;
  }

  #writableDir(path) {
    const found = this.#dir(path);
    if (found.readonly) throw new FsError('EPERM', found.path);
    return found;
  }

  /** An address that a page from any origin can show: pictures kept on the disk become blob: addresses, made once. */
  #publicUrl(node) {
    if (node.blob) {
      const data = this.#blobs.get(node.blob);
      if (!data) return null;
      let address = this.#objectUrls.get(node.blob);
      if (!address) {
        address = URL.createObjectURL(FileSystem.#dataUrlToBlob(data));
        this.#objectUrls.set(node.blob, address);
      }
      return address;
    }
    return this.#urlOf(node);
  }

  static #dataUrlToBlob(data) {
    const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(data);
    const type = m?.[1] || 'application/octet-stream';
    const raw = m ? (m[2] ? atob(m[3]) : decodeURIComponent(m[3])) : '';
    return new Blob([Uint8Array.from(raw, (c) => c.charCodeAt(0))], { type });
  }

  #urlOf(node) {
    if (node.blob) return this.#blobs.get(node.blob) ?? null;
    if (!node.url) return null;
    return /^(data:|blob:|https?:)/.test(node.url) ? node.url : url(node.url);
  }

  #entry(node, path, forApps = false) {
    const isFile = node.type === 'file';
    return {
      name: node.name,
      path,
      type: node.type,
      ext: isFile ? extname(node.name) : '',
      size: isFile ? node.size ?? 0 : null,
      ctime: node.ctime,
      mtime: node.mtime,
      url: forApps ? this.#publicUrl(node) : this.#urlOf(node),
      system: !!node.system
    };
  }

  /** A copy of the folder tree without the files of the system (they come from the server on every start). */
  static #withoutMounts(node) {
    if (node.type !== 'dir') return node;
    const children = {};
    for (const [key, child] of Object.entries(node.children)) {
      if (!child.mount) children[key] = FileSystem.#withoutMounts(child);
    }
    return { ...node, children };
  }

  /** Bytes the disk itself holds: the system files do not count. */
  static #diskSize(node) {
    if (node.mount) return 0;
    if (node.type === 'file') return node.size ?? 0;
    let total = 0;
    for (const child of Object.values(node.children)) total += FileSystem.#diskSize(child);
    return total;
  }

  static #sizeOf(node) {
    if (node.type === 'file') return node.size ?? 0;
    let total = 0;
    for (const child of Object.values(node.children)) total += FileSystem.#sizeOf(child);
    return total;
  }

  #total() {
    let total = FileSystem.#diskSize(this.#data.root);
    for (const item of this.#data.trash) total += FileSystem.#diskSize(item.node);
    return total;
  }

  #ensureSpace(bytes) {
    if (bytes > 0 && this.#total() + bytes > this.capacity) throw new FsError('ENOSPC', '');
  }

  /** Forget the pictures of a node that is deleted for good. */
  #release(node) {
    eachNode(node, (n) => {
      if (!n.blob) return;
      const address = this.#objectUrls.get(n.blob);
      if (address) {
        URL.revokeObjectURL(address);
        this.#objectUrls.delete(n.blob);
      }
      this.#blobs.delete(n.blob);
      this.#deleteBlob(n.blob);
    });
  }

  /* ---- reading ---- */

  /** Canonical absolute path, or null when the path is not valid. */
  resolve(path, cwd) {
    try {
      return normalize(path, cwd);
    } catch {
      return null;
    }
  }

  /** Entry for a path, or null when it does not exist. Never throws. */
  stat(path) {
    const full = this.resolve(path);
    if (!full) return null;
    const found = this.#lookup(full);
    return found ? this.#entry(found.node, found.path) : null;
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

  /** Entries of a folder (unsorted). */
  list(path) {
    const found = this.#dir(normalize(path));
    return Object.values(found.node.children).map((child) => this.#entry(child, join(found.path, child.name)));
  }

  /** Text content of a file ("" for pictures). */
  readFile(path) {
    const full = normalize(path);
    const found = this.#lookup(full);
    if (!found) throw new FsError('ENOENT', full);
    if (found.node.type === 'dir') throw new FsError('EISDIR', found.path);
    if (found.node.src) return this.#sourceText(found.node);
    return found.node.content ?? '';
  }

  /** The whole folder tree as lists of entries (no content), for the remote copies in the apps. */
  snapshot() {
    return { dirs: this.#listings(this.#data.root, ROOT_PATH), root: this.#entry(this.#data.root, ROOT_PATH, true), trash: this.trashList(true), usage: this.usage(), persistent: this.persistent };
  }

  /** The folder at `path` and everything below it, as lists of entries; null when it is gone. */
  subtree(path) {
    const found = this.#lookup(normalize(path));
    if (!found || found.node.type !== 'dir') return null;
    return { path: found.path, dirs: this.#listings(found.node, found.path) };
  }

  #listings(node, path, out = {}) {
    out[path.toLowerCase()] = Object.values(node.children).map((child) => this.#entry(child, join(path, child.name), true));
    for (const child of Object.values(node.children)) if (child.type === 'dir') this.#listings(child, join(path, child.name), out);
    return out;
  }

  /** The data URL of a picture (a file with a url or a blob); null for anything else. */
  async readData(path) {
    const found = this.#lookup(normalize(path));
    if (!found || found.node.type !== 'file') throw new FsError('ENOENT', path);
    if (found.node.blob) return this.#blobs.get(found.node.blob) ?? null;
    const address = this.#urlOf(found.node);
    if (!address) return null;
    if (address.startsWith('data:')) return address;
    const blob = await (await fetch(address)).blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** Total size in bytes of a file or of everything inside a folder. */
  sizeOf(path) {
    const found = this.#lookup(normalize(path));
    if (!found) throw new FsError('ENOENT', path);
    return FileSystem.#sizeOf(found.node);
  }

  /** Number of files and folders below a folder. */
  count(path) {
    const found = this.#dir(normalize(path));
    let files = 0;
    let folders = 0;
    const walk = (node) => {
      for (const child of Object.values(node.children)) {
        if (child.type === 'dir') {
          folders++;
          walk(child);
        } else files++;
      }
    };
    walk(found.node);
    return { files, folders };
  }

  /** Recursive, case-insensitive name search below `base`. */
  search(base, query, { limit = 200 } = {}) {
    const needle = String(query).trim().toLowerCase();
    const out = [];
    if (!needle) return out;
    const found = this.#lookup(normalize(base));
    if (!found || found.node.type !== 'dir') return out;
    const walk = (node, path) => {
      for (const child of Object.values(node.children)) {
        if (out.length >= limit) return;
        const childPath = join(path, child.name);
        if (child.name.toLowerCase().includes(needle)) out.push(this.#entry(child, childPath));
        if (child.type === 'dir') walk(child, childPath);
      }
    };
    walk(found.node, found.path);
    return out;
  }

  /** Most recently modified files below `base`, newest first. */
  recent(base = HOME, limit = 6) {
    const out = [];
    const found = this.#lookup(normalize(base));
    if (!found || found.node.type !== 'dir') return out;
    const walk = (node, path) => {
      for (const child of Object.values(node.children)) {
        const childPath = join(path, child.name);
        if (child.type === 'dir') walk(child, childPath);
        else out.push(this.#entry(child, childPath));
      }
    };
    walk(found.node, found.path);
    return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
  }

  /** A name that is free inside `dir`: "New folder", "New folder (2)", ... */
  uniqueName(dir, desired) {
    const found = this.#dir(normalize(dir));
    return FileSystem.#unique(found.node, desired);
  }

  static #unique(dirNode, desired) {
    if (!dirNode.children[desired.toLowerCase()]) return desired;
    const dot = desired.lastIndexOf('.');
    const base = dot > 0 ? desired.slice(0, dot) : desired;
    const ext = dot > 0 ? desired.slice(dot) : '';
    for (let i = 2; ; i++) {
      const candidate = `${base} (${i})${ext}`;
      if (!dirNode.children[candidate.toLowerCase()]) return candidate;
    }
  }

  /** Disk usage in bytes. */
  usage() {
    const used = this.#total();
    return { used, capacity: this.capacity, free: Math.max(0, this.capacity - used) };
  }

  /* ---- writing ---- */

  /** Create a folder. Returns its path. */
  mkdir(path, { recursive = false } = {}) {
    const full = normalize(path);
    if (full === ROOT_PATH) throw new FsError('EEXIST', full);
    const parentPath = dirname(full);
    if (recursive && !this.#lookup(parentPath)) this.mkdir(parentPath, { recursive: true });
    const parent = this.#writableDir(parentPath);
    const name = basename(full);
    if (!isValidName(name)) throw new FsError('EINVAL', name);
    const existing = parent.node.children[name.toLowerCase()];
    if (existing) {
      if (recursive && existing.type === 'dir') return join(parent.path, existing.name);
      throw new FsError('EEXIST', join(parent.path, existing.name));
    }
    const now = Date.now();
    parent.node.children[name.toLowerCase()] = { type: 'dir', name, ctime: now, mtime: now, children: {} };
    parent.node.mtime = now;
    this.#commit([parent.path]);
    return join(parent.path, name);
  }

  /** Create or replace a text file. Returns its path. */
  writeFile(path, content = '', { append = false, exclusive = false } = {}) {
    const full = normalize(path);
    if (full === ROOT_PATH) throw new FsError('EISDIR', full);
    const parent = this.#writableDir(dirname(full));
    const name = basename(full);
    const key = name.toLowerCase();
    const existing = parent.node.children[key];
    const now = Date.now();
    const text = String(content);
    if (existing) {
      const existingPath = join(parent.path, existing.name);
      if (existing.type === 'dir') throw new FsError('EISDIR', existingPath);
      if (exclusive) throw new FsError('EEXIST', existingPath);
      if (existing.url || existing.blob) throw new FsError('EPERM', existingPath);
      const next = append ? (existing.content ?? '') + text : text;
      this.#ensureSpace(byteLength(next) - (existing.size ?? 0));
      existing.content = next;
      existing.size = byteLength(next);
      existing.mtime = now;
      this.#commit([parent.path]);
      return existingPath;
    }
    if (!isValidName(name)) throw new FsError('EINVAL', name);
    this.#ensureSpace(byteLength(text));
    parent.node.children[key] = { type: 'file', name, ctime: now, mtime: now, content: text, size: byteLength(text) };
    parent.node.mtime = now;
    this.#commit([parent.path]);
    return join(parent.path, name);
  }

  /**
   * Store a picture (or any other resource) by URL. `href` may be a data: URL
   * (kept in the picture store) or a URL relative to the OS root. A clashing
   * name gets " (2)" appended. Returns the path of the new file.
   */
  writeLink(path, href, size = 0) {
    const full = normalize(path);
    const parent = this.#writableDir(dirname(full));
    const name = FileSystem.#unique(parent.node, basename(full));
    if (!isValidName(name)) throw new FsError('EINVAL', name);
    this.#ensureSpace(size);
    const now = Date.now();
    const node = { type: 'file', name, ctime: now, mtime: now, size };
    if (String(href).startsWith('data:')) {
      const id = newId();
      this.#blobs.set(id, href);
      this.#putBlob(id, href);
      node.blob = id;
    } else {
      node.url = href;
    }
    parent.node.children[name.toLowerCase()] = node;
    parent.node.mtime = now;
    this.#commit([parent.path]);
    return join(parent.path, name);
  }

  #detach(path) {
    const full = normalize(path);
    if (full === ROOT_PATH) throw new FsError('EPERM', full);
    const found = this.#lookup(full);
    if (!found) throw new FsError('ENOENT', full);
    if (found.node.system || found.readonly) throw new FsError('EPERM', found.path);
    const parent = this.#lookup(dirname(found.path));
    return { found, parent };
  }

  /** Delete permanently. Folders need `recursive` unless they are empty. */
  remove(path, { recursive = false } = {}) {
    const { found, parent } = this.#detach(path);
    if (found.node.type === 'dir' && !recursive && Object.keys(found.node.children).length) {
      throw new FsError('ENOTEMPTY', found.path);
    }
    delete parent.node.children[found.node.name.toLowerCase()];
    parent.node.mtime = Date.now();
    this.#release(found.node);
    this.#commit([parent.path]);
  }

  /** Rename in place. Returns the new path. */
  rename(path, newName) {
    const { found, parent } = this.#detach(path);
    const name = String(newName).trim();
    if (!isValidName(name)) throw new FsError('EINVAL', name);
    const oldKey = found.node.name.toLowerCase();
    const newKey = name.toLowerCase();
    if (newKey !== oldKey && parent.node.children[newKey]) throw new FsError('EEXIST', join(parent.path, name));
    delete parent.node.children[oldKey];
    found.node.name = name;
    found.node.mtime = Date.now();
    parent.node.children[newKey] = found.node;
    parent.node.mtime = Date.now();
    this.#commit([parent.path]);
    return join(parent.path, name);
  }

  /** Move into another folder (optionally under a new name). Returns the new path. */
  move(path, destDir, { name } = {}) {
    const { found, parent } = this.#detach(path);
    const dest = this.#writableDir(normalize(destDir));
    if (isInside(dest.path, found.path)) throw new FsError('EINVAL', dest.path);
    const finalName = name ?? found.node.name;
    if (!isValidName(finalName)) throw new FsError('EINVAL', finalName);
    const oldKey = found.node.name.toLowerCase();
    const newKey = finalName.toLowerCase();
    const sameDir = dest.node === parent.node;
    if (sameDir && newKey === oldKey) return found.path;
    if (dest.node.children[newKey]) throw new FsError('EEXIST', join(dest.path, finalName));
    delete parent.node.children[oldKey];
    found.node.name = finalName;
    dest.node.children[newKey] = found.node;
    const now = Date.now();
    parent.node.mtime = now;
    dest.node.mtime = now;
    this.#commit([parent.path, dest.path]);
    return join(dest.path, finalName);
  }

  /** Copy into another folder. A clashing name gets " - Copy" appended. Returns the new path. */
  copy(path, destDir, { name } = {}) {
    const full = normalize(path);
    const found = this.#lookup(full);
    if (!found) throw new FsError('ENOENT', full);
    if (full === ROOT_PATH) throw new FsError('EPERM', full);
    const dest = this.#writableDir(normalize(destDir));
    if (found.node.type === 'dir' && isInside(dest.path, found.path)) throw new FsError('EINVAL', dest.path);
    let finalName = name ?? found.node.name;
    if (!isValidName(finalName)) throw new FsError('EINVAL', finalName);
    if (dest.node.children[finalName.toLowerCase()]) {
      if (name) throw new FsError('EEXIST', join(dest.path, finalName));
      const dot = found.node.type === 'file' ? finalName.lastIndexOf('.') : -1;
      const base = dot > 0 ? finalName.slice(0, dot) : finalName;
      const ext = dot > 0 ? finalName.slice(dot) : '';
      finalName = FileSystem.#unique(dest.node, `${base} - Copy${ext}`);
    }
    this.#ensureSpace(FileSystem.#sizeOf(found.node));
    const clone = structuredClone(found.node);
    clone.name = finalName;
    clone.ctime = Date.now();
    // A copy is an ordinary item (even of a protected system folder) with its own picture data.
    eachNode(clone, (n) => {
      if (n.src) {
        n.content = this.#sourceText(n);
        n.size = byteLength(n.content);
        delete n.src;
      }
      delete n.mount;
      delete n.system;
      delete n.readonly;
      if (n.blob) {
        const id = newId();
        const data = this.#blobs.get(n.blob);
        if (data) {
          this.#blobs.set(id, data);
          this.#putBlob(id, data);
        }
        n.blob = id;
      }
    });
    dest.node.children[finalName.toLowerCase()] = clone;
    dest.node.mtime = Date.now();
    this.#commit([dest.path]);
    return join(dest.path, finalName);
  }

  /* ---- recycle bin ---- */

  /** Move to the Recycle Bin. Returns the id of the deleted item. */
  trash(path) {
    const { found, parent } = this.#detach(path);
    delete parent.node.children[found.node.name.toLowerCase()];
    parent.node.mtime = Date.now();
    const id = newId();
    this.#data.trash.unshift({ id, name: found.node.name, originalPath: found.path, deletedAt: Date.now(), node: found.node });
    this.#commit([parent.path], true);
    return id;
  }

  trashList(forApps = false) {
    return this.#data.trash.map((item) => ({
      id: item.id,
      name: item.name,
      originalPath: item.originalPath,
      originalDir: dirname(item.originalPath),
      deletedAt: item.deletedAt,
      type: item.node.type,
      ext: item.node.type === 'file' ? extname(item.name) : '',
      size: FileSystem.#sizeOf(item.node),
      url: forApps ? this.#publicUrl(item.node) : this.#urlOf(item.node)
    }));
  }

  trashCount() {
    return this.#data.trash.length;
  }

  /** Put a deleted item back where it came from. Returns its path. */
  restore(id) {
    const index = this.#data.trash.findIndex((item) => item.id === id);
    if (index < 0) throw new FsError('ENOENT', id);
    const item = this.#data.trash[index];
    const parentPath = dirname(item.originalPath);
    if (!this.#lookup(parentPath)) this.mkdir(parentPath, { recursive: true });
    const parent = this.#writableDir(parentPath);
    const name = FileSystem.#unique(parent.node, item.name);
    item.node.name = name;
    parent.node.children[name.toLowerCase()] = item.node;
    parent.node.mtime = Date.now();
    this.#data.trash.splice(this.#data.trash.findIndex((entry) => entry.id === id), 1);
    this.#commit([parent.path], true);
    return join(parent.path, name);
  }

  /** Delete one item from the Recycle Bin for good. */
  purge(id) {
    const index = this.#data.trash.findIndex((item) => item.id === id);
    if (index < 0) return;
    this.#release(this.#data.trash[index].node);
    this.#data.trash.splice(index, 1);
    this.#commit([], true);
  }

  emptyTrash() {
    if (!this.#data.trash.length) return;
    this.#data.trash.forEach((item) => this.#release(item.node));
    this.#data.trash = [];
    this.#commit([], true);
  }
}

/**
 * The disk of this page. The shell (and the tests) get the real one the first
 * time it is used. An app page gets a remote copy: the SDK installs it with
 * useFs() before anything else touches the disk.
 */
export const services = { fs: null };

export function useFs(instance) {
  services.fs = instance;
}

export const fs = new Proxy(
  {},
  {
    get(_, key) {
      const target = (services.fs ??= new FileSystem());
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(_, key, value) {
      return Reflect.set((services.fs ??= new FileSystem()), key, value);
    }
  }
);
