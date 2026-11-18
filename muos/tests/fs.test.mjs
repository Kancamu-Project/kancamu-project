import './shim.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { fs, FsError, normalize, join, dirname, basename, extname, isInside, isValidName, HOME, ROOT_PATH, KNOWN_FOLDERS } = await import('../system/core/fs.js');
const { WELCOME_PATH, GUIDE_PATH } = await import('../system/config/fs.js');
const warn = console.warn;
console.warn = () => {}; // there is no IndexedDB here: the disk lives in memory, which is what these tests need
await fs.init();
console.warn = warn;

const DOCS = KNOWN_FOLDERS.documents;
const code = (fn) => {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof FsError, `expected an FsError, got ${err}`);
    return err.code;
  }
  assert.fail('expected the call to throw');
};

test('paths: normalize', () => {
  assert.equal(normalize('C:/a/b'), 'C:/a/b');
  assert.equal(normalize('c:/a/b/'), 'C:/a/b');
  assert.equal(normalize('../x', 'C:/a/b'), 'C:/a/x');
  assert.equal(normalize('.', 'C:/a'), 'C:/a');
  assert.equal(normalize('/a', 'C:/z'), 'C:/a');
  assert.equal(normalize('"C:/Program Files"'), 'C:/Program Files');
  assert.equal(normalize('../../..', 'C:/a'), ROOT_PATH);
  assert.equal(code(() => normalize('D:/x')), 'ENODRIVE');
});

test('paths: join, dirname, basename, extname, isInside', () => {
  assert.equal(join('C:/', 'a'), 'C:/a');
  assert.equal(join('C:/a', 'b'), 'C:/a/b');
  assert.equal(dirname('C:/a/b'), 'C:/a');
  assert.equal(dirname('C:/a'), ROOT_PATH);
  assert.equal(basename('C:/a/b.TXT'), 'b.TXT');
  assert.equal(extname('b.TXT'), 'txt');
  assert.equal(extname('.hidden'), '');
  assert.equal(extname('noext'), '');
  assert.ok(isInside('C:/A/b', 'c:/a'));
  assert.ok(!isInside('C:/ab', 'C:/a'));
});

test('names: what is allowed', () => {
  for (const ok of ['a', 'My file.txt', 'ñ.md']) assert.ok(isValidName(ok), ok);
  for (const bad of ['', ' a', 'a ', 'a.', '..', 'a:b', 'a/b', 'a\\b', 'a*', 'a?', 'a"', 'a<', 'a|', 'x'.repeat(256)]) assert.ok(!isValidName(bad), JSON.stringify(bad));
});

test('the disk starts with the standard folders and a welcome file', () => {
  for (const path of Object.values(KNOWN_FOLDERS)) assert.ok(fs.isDir(path), path);
  assert.ok(fs.readFile(WELCOME_PATH).includes('Welcome'));
  assert.ok(fs.isFile(GUIDE_PATH));
  assert.equal(dirname(WELCOME_PATH), dirname(GUIDE_PATH));
  assert.equal(dirname(dirname(WELCOME_PATH)), KNOWN_FOLDERS.desktop);
  assert.ok(fs.stat(join(KNOWN_FOLDERS.pictures, 'wallpaper_default_light.webp')).url.endsWith('/wallpapers/wallpaper_default_light.webp'));
});

test('files and folders: create, read, list, case-insensitive lookup', () => {
  const dir = fs.mkdir(join(DOCS, 'T1'));
  assert.equal(dir, join(DOCS, 'T1'));
  fs.writeFile(join(dir, 'a.txt'), 'héllo');
  assert.equal(fs.readFile(join(dir, 'A.TXT')), 'héllo');
  assert.equal(fs.stat(join(dir, 'a.txt')).size, 6); // bytes, not characters
  assert.deepEqual(fs.list(dir).map((e) => e.name), ['a.txt']);
  fs.writeFile(join(dir, 'a.txt'), '!', { append: true });
  assert.equal(fs.readFile(join(dir, 'a.txt')), 'héllo!');
  assert.equal(code(() => fs.mkdir(dir)), 'EEXIST');
  assert.equal(code(() => fs.writeFile(join(dir, 'a.txt'), 'x', { exclusive: true })), 'EEXIST');
  assert.equal(code(() => fs.readFile(dir)), 'EISDIR');
  assert.equal(code(() => fs.readFile(join(dir, 'missing'))), 'ENOENT');
  assert.equal(code(() => fs.list(join(dir, 'a.txt'))), 'ENOTDIR');
  assert.equal(code(() => fs.writeFile(join(dir, 'b:c'), 'x')), 'EINVAL');
  assert.equal(fs.mkdir(join(dir, 'x', 'y', 'z'), { recursive: true }), join(dir, 'x', 'y', 'z'));
});

test('unique names', () => {
  const dir = fs.mkdir(join(DOCS, 'T2'));
  assert.equal(fs.uniqueName(dir, 'New folder'), 'New folder');
  fs.mkdir(join(dir, 'New folder'));
  assert.equal(fs.uniqueName(dir, 'New folder'), 'New folder (2)');
  fs.writeFile(join(dir, 'n.txt'), '');
  assert.equal(fs.uniqueName(dir, 'N.txt'), 'N (2).txt');
});

test('rename and move', () => {
  const dir = fs.mkdir(join(DOCS, 'T3'));
  fs.writeFile(join(dir, 'a.txt'), '1');
  fs.writeFile(join(dir, 'b.txt'), '2');
  assert.equal(fs.rename(join(dir, 'a.txt'), 'c.txt'), join(dir, 'c.txt'));
  assert.equal(code(() => fs.rename(join(dir, 'c.txt'), 'b.txt')), 'EEXIST');
  assert.equal(code(() => fs.rename(join(dir, 'c.txt'), 'bad/name')), 'EINVAL');
  const sub = fs.mkdir(join(dir, 'sub'));
  assert.equal(fs.move(join(dir, 'c.txt'), sub), join(sub, 'c.txt'));
  assert.ok(!fs.exists(join(dir, 'c.txt')));
  assert.equal(code(() => fs.move(sub, join(sub, 'deeper'))), 'ENOENT'); // destination does not exist
  fs.mkdir(join(sub, 'deeper'));
  assert.equal(code(() => fs.move(sub, join(sub, 'deeper'))), 'EINVAL'); // a folder into itself
});

test('copy: independent copies, names that clash, protected folders lose their protection', () => {
  const dir = fs.mkdir(join(DOCS, 'T4'));
  fs.writeFile(join(dir, 'a.txt'), 'one');
  const copy = fs.copy(join(dir, 'a.txt'), dir);
  assert.equal(copy, join(dir, 'a - Copy.txt'));
  fs.writeFile(copy, 'two');
  assert.equal(fs.readFile(join(dir, 'a.txt')), 'one');
  assert.equal(fs.copy(join(dir, 'a.txt'), dir), join(dir, 'a - Copy (2).txt'));

  const pictures = fs.copy(KNOWN_FOLDERS.pictures, dir);
  assert.equal(fs.stat(pictures).system, false);
  fs.remove(pictures, { recursive: true }); // a copy of a system folder can be deleted
  assert.equal(code(() => fs.remove(KNOWN_FOLDERS.pictures, { recursive: true })), 'EPERM');
});

test('delete: folders need "recursive", the system is protected', () => {
  const dir = fs.mkdir(join(DOCS, 'T5'));
  fs.writeFile(join(dir, 'a.txt'), '');
  assert.equal(code(() => fs.remove(dir)), 'ENOTEMPTY');
  fs.remove(dir, { recursive: true });
  assert.ok(!fs.exists(dir));
  assert.equal(code(() => fs.remove(ROOT_PATH)), 'EPERM');
  assert.equal(code(() => fs.remove(DOCS)), 'EPERM');
  assert.equal(code(() => fs.writeFile('C:/System/new.txt', 'x')), 'EPERM'); // read-only tree
});

test('recycle bin: trash, restore (also when the name is taken or the folder is gone), purge', () => {
  const dir = fs.mkdir(join(DOCS, 'T6'));
  fs.writeFile(join(dir, 'a.txt'), 'keep');
  const before = fs.trashCount();
  const id = fs.trash(join(dir, 'a.txt'));
  assert.equal(fs.trashCount(), before + 1);
  assert.ok(!fs.exists(join(dir, 'a.txt')));
  assert.equal(fs.trashList().find((i) => i.id === id).originalPath, join(dir, 'a.txt'));

  fs.writeFile(join(dir, 'a.txt'), 'new one');
  assert.equal(fs.restore(id), join(dir, 'a (2).txt'));
  assert.equal(fs.readFile(join(dir, 'a (2).txt')), 'keep');

  const id2 = fs.trash(join(dir, 'a (2).txt'));
  fs.remove(dir, { recursive: true });
  assert.equal(fs.restore(id2), join(dir, 'a (2).txt')); // the folder is created again
  const id3 = fs.trash(join(dir, 'a (2).txt'));
  fs.purge(id3);
  assert.ok(!fs.trashList().some((i) => i.id === id3));
  fs.emptyTrash();
  assert.equal(fs.trashCount(), 0);
});

test('pictures: data is kept apart, copies get their own, deleting releases them', () => {
  const dir = fs.mkdir(join(DOCS, 'T7'));
  const data = 'data:image/png;base64,AAAA';
  const path = fs.writeLink(join(dir, 'p.png'), data, 3);
  assert.equal(fs.stat(path).url, data);
  assert.equal(fs.readFile(path), '');
  assert.equal(code(() => fs.writeFile(path, 'text')), 'EPERM');
  assert.equal(fs.writeLink(join(dir, 'p.png'), data, 3), join(dir, 'p (2).png')); // a clashing name is made unique
  const copy = fs.copy(path, dir);
  assert.equal(fs.stat(copy).url, data);
  fs.remove(path);
  assert.equal(fs.stat(copy).url, data); // the copy does not depend on the original
  fs.remove(dir, { recursive: true });
});

test('disk space: ENOSPC instead of silently losing data', () => {
  const dir = fs.mkdir(join(DOCS, 'T8'));
  const capacity = fs.capacity;
  fs.capacity = fs.usage().used + 10;
  assert.equal(code(() => fs.writeFile(join(dir, 'big.txt'), 'x'.repeat(100))), 'ENOSPC');
  assert.ok(!fs.exists(join(dir, 'big.txt')));
  fs.writeFile(join(dir, 'small.txt'), 'ok');
  assert.equal(code(() => fs.writeLink(join(dir, 'p.png'), 'data:image/png;base64,AAAA', 1000)), 'ENOSPC');
  fs.capacity = capacity;
  assert.ok(fs.usage().free > 0);
});

test('search and recent files', () => {
  const dir = fs.mkdir(join(DOCS, 'T9'));
  fs.writeFile(join(dir, 'Report-2026.txt'), '');
  fs.mkdir(join(dir, 'reports'));
  const names = fs.search(HOME, 'REPORT').map((e) => e.name);
  assert.ok(names.includes('Report-2026.txt') && names.includes('reports'));
  assert.deepEqual(fs.search(HOME, ''), []);
  assert.ok(fs.recent(HOME, 3).length <= 3);
});

test('change events say what changed', () => {
  const events = [];
  const off = fs.on('change', (e) => events.push(e));
  const dir = fs.mkdir(join(DOCS, 'T10'));
  fs.trash(dir);
  off();
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].paths, [DOCS]);
  assert.ok(events[1].trash);
});

test('paths use "/" and a typed backslash is turned into one', () => {
  assert.equal(normalize('C:\\a\\b'), 'C:/a/b');
  assert.equal(normalize('..\\x', 'C:/a/b'), 'C:/a/x');
  assert.equal(normalize('\\a', 'C:/z'), 'C:/a');
  assert.equal(HOME, 'C:/Users/Kanca');
  assert.ok(!Object.values(KNOWN_FOLDERS).some((path) => path.includes('\\')));
});
