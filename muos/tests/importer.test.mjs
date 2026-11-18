import './shim.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { fs, join, KNOWN_FOLDERS } = await import('../system/core/fs.js');
const { importDropped } = await import('../system/core/importer.js');

const warn = console.warn;
console.warn = () => {};
await fs.init();
console.warn = warn;

const makeDir = (name) => fs.mkdir(join(KNOWN_FOLDERS.downloads, name));

/** A folder as the browser reports it: entries that can be read in batches. */
const folderEntry = (name, children) => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader() {
    let done = false;
    return {
      readEntries(ok) {
        const batch = done ? [] : children;
        done = true;
        ok(batch);
      }
    };
  }
});
const fileEntry = (file) => ({ isFile: true, isDirectory: false, name: file.name, file: (ok) => ok(file) });

test('a text file is stored as text', async () => {
  const dir = makeDir('I1');
  const { created, skipped } = await importDropped([new File(['héllo\nworld'], 'note.txt', { type: 'text/plain' })], dir);
  assert.deepEqual(skipped, []);
  assert.deepEqual(created, [join(dir, 'note.txt')]);
  assert.equal(fs.readFile(created[0]), 'héllo\nworld');
});

test('a picture keeps its bytes', async () => {
  const dir = makeDir('I2');
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 255]);
  const { created } = await importDropped([new File([png], 'pic.png', { type: 'image/png' })], dir);
  const url = fs.stat(created[0]).url;
  assert.equal(url, `data:image/png;base64,${Buffer.from(png).toString('base64')}`);
  assert.equal(fs.stat(created[0]).size, png.length);
});

test('a name that is taken gets a number; characters a file name cannot hold are replaced', async () => {
  const dir = makeDir('I3');
  await importDropped([new File(['a'], 'a.txt')], dir);
  const { created } = await importDropped([new File(['b'], 'a.txt'), new File(['c'], 'what?.txt')], dir);
  assert.deepEqual(created.map((p) => p.split('/').pop()), ['a (2).txt', 'what_.txt']);
  assert.equal(fs.readFile(join(dir, 'a.txt')), 'a'); // the first one was not overwritten
});

test('there is no size limit but the space: a file that does not fit is skipped, the others are still imported', async () => {
  const dir = makeDir('I4');
  const { free } = fs.usage();
  const big = new File([new Uint8Array(1)], 'big.bin');
  Object.defineProperty(big, 'size', { value: free + 1 });
  const { created, skipped } = await importDropped([big, new File(['ok'], 'ok.txt')], dir);
  assert.deepEqual(skipped.map((s) => [s.name, s.reason, s.size]), [['big.bin', 'noSpace', free + 1]]);
  assert.equal(created.length, 1);
});

test('a file bigger than the old 50 MB limit is taken when there is room', async () => {
  const dir = makeDir('I4b');
  const before = fs.capacity;
  fs.capacity = 500 * 1024 * 1024;
  try {
    const large = new File([new Uint8Array(1)], 'large.bin');
    Object.defineProperty(large, 'size', { value: 80 * 1024 * 1024 });
    large.arrayBuffer = async () => new ArrayBuffer(8);
    const { created, skipped } = await importDropped([large], dir);
    assert.deepEqual(skipped, []);
    assert.equal(created.length, 1);
  } finally {
    fs.capacity = before;
  }
});

test('folders are copied with everything inside', async () => {
  const dir = makeDir('I5');
  const tree = folderEntry('Project', [fileEntry(new File(['x'], 'a.txt')), folderEntry('src', [fileEntry(new File(['y'], 'b.js'))])]);
  const { created, skipped } = await importDropped([tree], dir);
  assert.deepEqual(skipped, []);
  assert.deepEqual(created, [join(dir, 'Project')]); // only the top level is reported
  const project = join(dir, 'Project');
  assert.equal(fs.readFile(join(project, 'a.txt')), 'x');
  assert.equal(fs.readFile(join(join(project, 'src'), 'b.js')), 'y');
});

test('a full disk is reported per file instead of failing the whole drop', async () => {
  const dir = makeDir('I6');
  const capacity = fs.capacity;
  fs.capacity = fs.usage().used + 5;
  const { created, skipped } = await importDropped([new File(['x'.repeat(100)], 'big.txt'), new File(['ok'], 'small.txt')], dir);
  fs.capacity = capacity;
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, 'noSpace'); // seen before the file is read
  assert.deepEqual(created, [join(dir, 'small.txt')]);
});
