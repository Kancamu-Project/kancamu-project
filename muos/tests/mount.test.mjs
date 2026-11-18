import './shim.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildIndex } from '../tools/build-file-index.mjs';

const { fs, FsError } = await import('../system/core/fs.js');
const warn = console.warn;
console.warn = () => {};
await fs.init();
console.warn = warn;

const code = (fn) => {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof FsError, `expected an FsError, got ${err}`);
    return err.code;
  }
  assert.fail('expected the call to throw');
};

const root = fileURLToPath(new URL('..', import.meta.url));
const used = fs.usage().used;
const reads = [];
fs.mount(
  {
    built: 1700000000000,
    files: [
      ['System/core/hello.js', 'system/core/hello.js', 20, 0],
      ['System/main.js', 'system/main.js', 5, 0],
      ['System/config/logo.png', 'system/config/logo.png', 99, 1],
      ['Program Files/Notepad/app.js', 'apps/notepad/app.js', 7, 0]
    ]
  },
  { read: (address) => (reads.push(address), `// ${address}`) }
);

test('the system files show up read-only in C:/System and C:/Program Files', () => {
  assert.deepEqual(fs.list('C:/System').map((e) => e.name).sort(), ['config', 'core', 'main.js']);
  assert.equal(fs.stat('C:/System/core/hello.js').type, 'file');
  assert.equal(fs.stat('C:/System/core').system, true);
  assert.ok(fs.isDir('C:/Program Files/Notepad'));
  assert.equal(fs.stat('C:/System/main.js').mtime, 1700000000000);
});

test('a text is read from the server once, and its size follows what was read', () => {
  assert.equal(fs.readFile('C:/System/main.js'), '// system/main.js');
  assert.equal(fs.readFile('C:/System/main.js'), '// system/main.js');
  assert.equal(reads.filter((address) => address === 'system/main.js').length, 1);
  assert.equal(fs.stat('C:/System/main.js').size, '// system/main.js'.length);
});

test('a picture is a link to the file on the server', () => {
  const logo = fs.stat('C:/System/config/logo.png');
  assert.ok(logo.url.endsWith('system/config/logo.png'));
  assert.equal(fs.readFile('C:/System/config/logo.png'), '');
});

test('nothing in the system folders can be changed', () => {
  assert.equal(code(() => fs.writeFile('C:/System/main.js', 'x')), 'EPERM');
  assert.equal(code(() => fs.writeFile('C:/System/new.txt', 'x')), 'EPERM');
  assert.equal(code(() => fs.mkdir('C:/Program Files/Mine')), 'EPERM');
  assert.equal(code(() => fs.remove('C:/System/main.js')), 'EPERM');
  assert.equal(code(() => fs.trash('C:/Program Files/Notepad/app.js')), 'EPERM');
  assert.equal(code(() => fs.rename('C:/System/main.js', 'other.js')), 'EPERM');
  assert.equal(code(() => fs.move('C:/System/main.js', 'C:/Users/Kanca/Documents')), 'EPERM');
});

test('a copy of a system file is an ordinary file with its own text', () => {
  const copy = fs.copy('C:/System/core/hello.js', 'C:/Users/Kanca/Documents');
  assert.equal(fs.readFile(copy), '// system/core/hello.js');
  assert.equal(fs.stat(copy).system, false);
  fs.writeFile(copy, 'mine');
  assert.equal(fs.readFile(copy), 'mine');
  assert.equal(fs.readFile('C:/System/core/hello.js'), '// system/core/hello.js');
  fs.remove(copy);
});

test('the system files do not use the space of the disk', () => {
  assert.equal(fs.usage().used, used);
  assert.ok(fs.sizeOf('C:/System') > 0);
});

test('the list of the project files is up to date (run: npm run index)', () => {
  const committed = JSON.parse(readFileSync(`${root}system-files.json`, 'utf8'));
  const fresh = buildIndex();
  const paths = (index) => index.files.map(([to, from]) => `${to} <- ${from}`).sort();
  assert.deepEqual(paths(committed), paths(fresh));
  for (const [, from] of committed.files) assert.ok(existsSync(`${root}${from}`), from);
  // every app folder appears under Program Files, the system folders under System
  assert.ok(committed.files.some(([to]) => to.startsWith('Program Files/Notepad/')));
  assert.ok(committed.files.some(([to]) => to === 'System/main.js'));
});
