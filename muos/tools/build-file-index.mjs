/**
 * Writes system-files.json: the list of the files of this project, with the
 * place each one has on the virtual disk (C:/System and C:/Program Files).
 * A browser cannot list the folders of a static server, so the list is made
 * here and checked in. Run it again after files are added or removed:
 *
 *   npm run index
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Where each part of the project shows up on the virtual disk. */
const FOLDERS = [['system', 'System']];
const BINARY = new Set(['png', 'webp', 'jpg', 'jpeg', 'gif', 'ico']);
const SKIP = new Set(['.DS_Store', 'Thumbs.db']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out.sort();
}

const posix = (path) => relative(root, path).split(sep).join('/');

export function buildIndex() {
  const apps = JSON.parse(readFileSync(join(root, 'apps.json'), 'utf8')).apps;
  // the folder of an app is where its entry page is; a page at another address is not part of this project
  const folderOf = (app) => (/^([a-z][a-z0-9+.-]*:|\.\.\/)/i.test(app.entry ?? '') ? null : posix(dirname(join(root, app.entry))));
  const files = [];
  const add = (from, to) => files.push([to, from, statSync(join(root, from)).size, BINARY.has(from.split('.').pop().toLowerCase()) ? 1 : 0]);
  for (const [folder, target] of FOLDERS) for (const path of walk(join(root, folder))) add(posix(path), `${target}/${posix(path).slice(folder.length + 1)}`);
  for (const app of apps) {
    const from = folderOf(app);
    if (!from) continue;
    const name = app.name['en-US'].replace(/[\\/:*?"<>|]/g, '');
    for (const path of walk(join(root, from))) add(posix(path), `Program Files/${name}/${posix(path).slice(from.length + 1)}`);
  }
  return { built: 0, files };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const index = buildIndex();
  index.built = Date.now();
  writeFileSync(join(root, 'system-files.json'), `${JSON.stringify(index)}\n`);
  console.log(`system-files.json: ${index.files.length} files`);
}
