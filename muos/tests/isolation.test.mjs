import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPEN, PERMISSION_OF, PERMISSIONS, DEFAULT_PERMISSIONS } from '../system/config/permissions.js';

/**
 * An app is a project of its own: it reaches the OS only through messages, so a
 * page from any address can take its place. These tests keep the apps of this
 * project honest about that, and keep the permission tables complete.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(join(root, file), 'utf8');
const catalog = JSON.parse(read('apps.json')).apps;
const local = catalog.filter((app) => !/^([a-z][a-z0-9+.-]*:|\.\.\/)/i.test(app.entry ?? ''));

const folderOf = (app) => dirname(app.entry);
const filesOf = (app, extensions) => readdirSync(join(root, folderOf(app))).filter((name) => extensions.some((ext) => name.endsWith(ext)));

test('apps never reach into the shell, the page around them or the browser storage', () => {
  const banned = [
    [/window\.parent\b/, 'window.parent'],
    [/window\.top\b/, 'window.top'],
    [/\bparent\.(WebOS|document|window)/, 'parent.*'],
    [/\bWebOS\b/, 'WebOS'],
    [/\blocalStorage\b/, 'localStorage'],
    [/\bsessionStorage\b/, 'sessionStorage'],
    [/\bindexedDB\b/, 'indexedDB'],
    [/['"`]\.\.\/\.\.\//, 'a path into the OS folders']
  ];
  for (const app of local) {
    for (const name of filesOf(app, ['.js'])) {
      const source = read(`${folderOf(app)}/${name}`);
      for (const [pattern, label] of banned) assert.ok(!pattern.test(source), `${folderOf(app)}/${name} uses ${label}`);
    }
  }
});

test('every page finds the SDK at the address the OS gives it, not at a relative path', () => {
  for (const app of local) {
    const html = read(app.entry);
    assert.match(html, /searchParams|URLSearchParams/, `${app.id} reads the "os" parameter`);
    assert.match(html, /'webos\/': os \+ 'system\/'/, `${app.id} maps webos/ to the OS`);
    assert.ok(!/(src|href)="\.\.\/\.\.\//.test(html), `${app.id} links something by a relative path into the OS`);
    for (const name of filesOf(app, ['.js'])) {
      const source = read(`${folderOf(app)}/${name}`);
      for (const [, from] of source.matchAll(/from\s+'([^']+)'/g)) assert.ok(from.startsWith('./') || from.startsWith('webos/'), `${app.id}/${name} imports ${from}`);
    }
  }
});

test('the SDK and the protocol do not use anything but messages between page and shell', () => {
  for (const file of ['system/sdk/app.js', 'system/sdk/channel.js', 'system/sdk/remote-fs.js']) {
    const source = read(file);
    assert.ok(!/window\.parent\.WebOS|\.WebOS\b/.test(source), `${file} reaches into the shell`);
  }
  assert.ok(!/window\.WebOS/.test(read('system/main.js')), 'the shell no longer offers an object to the pages');
});

test('every call of the protocol is open or needs a permission that exists', () => {
  const protocol = read('system/shell/protocol.js');
  const handlers = [...protocol.matchAll(/^ {4}'([a-zA-Z]+(?:\.[a-zA-Z]+)+)':/gm)].map((m) => m[1]);
  assert.ok(handlers.length > 40, 'the handlers were found');
  for (const name of handlers) assert.ok(OPEN.has(name) || name in PERMISSION_OF, `${name} has no permission rule`);
  for (const name of [...OPEN, ...Object.keys(PERMISSION_OF)]) assert.ok(handlers.includes(name), `${name} has a rule but no handler`);
  for (const [name, permission] of Object.entries(PERMISSION_OF)) assert.ok(PERMISSIONS.includes(permission), `${name} needs unknown permission ${permission}`);
  for (const name of OPEN) assert.ok(!(name in PERMISSION_OF), `${name} is both open and restricted`);
});

test('the apps list only permissions that exist, and only the system apps get the powerful ones', () => {
  for (const app of catalog) {
    assert.ok(Array.isArray(app.permissions), `${app.id} says what it needs`);
    for (const permission of app.permissions) assert.ok(PERMISSIONS.includes(permission), `${app.id} asks for unknown permission ${permission}`);
  }
  const holders = (permission) => catalog.filter((app) => app.permissions.includes(permission)).map((app) => app.id).sort();
  assert.deepEqual(holders('system'), ['settings', 'task-manager']);
  assert.deepEqual(holders('power'), ['command-prompt', 'settings']);
  assert.deepEqual(holders('snip'), ['snipping-tool']);
});

test('a page that does not say what it needs gets the least', () => {
  assert.deepEqual([...DEFAULT_PERMISSIONS].sort(), ['notify', 'storage']);
  for (const risky of ['fs', 'system', 'power', 'settings', 'windows', 'launch']) assert.ok(!DEFAULT_PERMISSIONS.includes(risky), risky);
});

test('the OS code keeps its values in system/config/, not inline', () => {
  // a constant written as a plain value (number, text, list, table) belongs in a config file
  const literal = /^(?:export )?const [A-Z][A-Z0-9_]+ = (?:[0-9'"`\[{-]|new (?:Set|Map)\(\[|Object\.freeze\()/gm;
  const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));
  for (const file of walk('system').filter((f) => !f.startsWith('system/config/'))) {
    const found = [...read(file).matchAll(literal)].map((m) => m[0].slice(0, 50));
    assert.deepEqual(found, [], `${file} has values that belong in system/config/`);
  }
});

test('the sandbox of the frames of the apps is in system/config/, not typed into the code', () => {
  const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));
  for (const file of walk('system').filter((f) => !f.startsWith('system/config/'))) {
    const source = read(file);
    assert.ok(!/allow-scripts|'no-referrer'/.test(source), `${file} types the sandbox of a frame itself`);
  }
});
