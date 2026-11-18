import './shim.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { fs, FsError } = await import('../system/core/fs.js');
const { RemoteFs } = await import('../system/sdk/remote-fs.js');
const { updateFor } = await import('../system/core/fs-sync.js');
const warn = console.warn;
console.warn = () => {};
await fs.init();
console.warn = warn;

const DOCS = 'C:/Users/Kanca/Documents';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

// the shell side of the protocol: run a call on the real disk and announce what it changed first
let remote;
fs.on('change', (change) => remote?.apply(updateFor(fs, change)));
const calls = [];
const call = async (method, params) => {
  calls.push(method);
  const name = method.replace(/^fs\./, '');
  try {
    if (name === 'writeFile') return fs.writeFile(params.path, params.content, params.options);
    if (name === 'mkdir') return fs.mkdir(params.path, params.options);
    if (name === 'writeLink') return fs.writeLink(params.path, params.href, params.size);
    if (name === 'rename') return fs.rename(params.path, params.newName);
    if (name === 'move') return fs.move(params.path, params.destDir, params.options);
    if (name === 'copy') return fs.copy(params.path, params.destDir, params.options);
    if (name === 'remove') return fs.remove(params.path, params.options);
    if (name === 'trash') return fs.trash(params.path);
    if (name === 'restore') return fs.restore(params.id);
    if (name === 'readFile') return fs.readFile(params.path);
    if (name === 'readData') return fs.readData(params.path);
    throw new Error(`not in this test: ${method}`);
  } catch (err) {
    throw { code: err.code, path: err.path, message: err.message }; // as the shell sends an error
  }
};

fs.mkdir(`${DOCS}/Work`);
fs.writeFile(`${DOCS}/Work/a.txt`, 'hello');
fs.writeLink(`${DOCS}/Work/pic.png`, PNG, 8);
fs.writeFile(`${DOCS}/b.txt`, 'bb');
remote = new RemoteFs(call, fs.snapshot());

const names = (list) => list.map((e) => e.name).sort();
const same = (path) => {
  assert.deepEqual(
    names(remote.list(path)),
    names(fs.list(path)),
    path
  );
};

test('looking around gives the same answers as the real disk', () => {
  for (const path of ['C:/', 'C:/Users', DOCS, `${DOCS}/Work`, 'C:/System']) same(path);
  for (const path of [DOCS, `${DOCS}/Work/a.txt`, `${DOCS}/work/PIC.png`, 'C:/', 'C:/nope']) {
    const a = remote.stat(path);
    const b = fs.stat(path);
    assert.equal(a?.path, b?.path, path);
    assert.equal(a?.type, b?.type, path);
    assert.equal(a?.size, b?.size, path);
  }
  assert.equal(remote.sizeOf(DOCS), fs.sizeOf(DOCS));
  assert.deepEqual(remote.count(DOCS), fs.count(DOCS));
  assert.deepEqual(names(remote.search(DOCS, 'a')), names(fs.search(DOCS, 'a')));
  assert.deepEqual(remote.recent(DOCS, 3).map((e) => e.path), fs.recent(DOCS, 3).map((e) => e.path));
  assert.equal(remote.uniqueName(DOCS, 'b.txt'), fs.uniqueName(DOCS, 'b.txt'));
  assert.equal(remote.usage().used, fs.usage().used);
  assert.equal(remote.isDir(`${DOCS}/Work`), true);
  assert.equal(remote.isFile(`${DOCS}/Work`), false);
});

test('a picture on the disk has an address a page can show, not its data', () => {
  const pic = remote.stat(`${DOCS}/Work/pic.png`);
  assert.match(pic.url, /^blob:/);
  assert.equal(fs.stat(`${DOCS}/Work/pic.png`).url, PNG); // the shell itself keeps using the data
});

test('a change made through the remote copy is already in it when the call returns', async () => {
  const made = await remote.mkdir(`${DOCS}/New`);
  assert.equal(made, `${DOCS}/New`);
  assert.ok(remote.isDir(`${DOCS}/New`));
  await remote.writeFile(`${DOCS}/New/x.txt`, 'xyz');
  assert.equal(remote.stat(`${DOCS}/New/x.txt`).size, 3);
  assert.equal(await remote.readFile(`${DOCS}/New/x.txt`), 'xyz');
  await remote.rename(`${DOCS}/New`, 'Renamed');
  assert.ok(!remote.exists(`${DOCS}/New`));
  assert.ok(remote.exists(`${DOCS}/Renamed/x.txt`));
  const copy = await remote.copy(`${DOCS}/Renamed`, `${DOCS}/Work`);
  assert.ok(remote.exists(`${copy}/x.txt`)); // the whole folder, not just its entry
  same(DOCS);
  same(`${DOCS}/Work`);
});

test('removing a folder removes everything the copy knew below it', async () => {
  await remote.remove(`${DOCS}/Renamed`, { recursive: true });
  assert.ok(!remote.exists(`${DOCS}/Renamed/x.txt`));
  assert.throws(() => remote.list(`${DOCS}/Renamed`), (err) => err.code === 'ENOENT');
});

test('a disk error arrives as an FsError with its code', async () => {
  await assert.rejects(remote.mkdir(`${DOCS}/Work`), (err) => err instanceof FsError && err.code === 'EEXIST');
  await assert.rejects(remote.writeFile('C:/System/x.txt', 'no'), (err) => err instanceof FsError && err.code === 'EPERM');
  await assert.rejects(remote.readFile('C:/nope.txt'), (err) => err instanceof FsError && err.code === 'ENOENT');
});

test('the Recycle Bin follows the real one', async () => {
  const before = remote.trashCount();
  await remote.trash(`${DOCS}/b.txt`);
  assert.equal(remote.trashCount(), before + 1);
  assert.equal(remote.trashList()[0].name, 'b.txt');
  assert.ok(!remote.exists(`${DOCS}/b.txt`));
  await remote.restore(remote.trashList()[0].id);
  assert.ok(remote.exists(`${DOCS}/b.txt`));
  assert.equal(remote.trashCount(), before);
});

test('what needs file data asks the shell; looking around never does', () => {
  const asked = calls.filter((method) => method === 'fs.readFile' || method === 'fs.readData');
  assert.ok(asked.length >= 2);
  const before = calls.length;
  remote.list(DOCS);
  remote.stat(DOCS);
  remote.search(DOCS, 'a');
  assert.equal(calls.length, before);
});
