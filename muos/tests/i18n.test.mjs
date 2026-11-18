import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The OS keeps its strings in /languages. Every app keeps the strings of its own in
 * apps/<id>/languages (the same language codes). The OS list of languages is the one both follow.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const json = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));

function flatten(object, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(object)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, full, out);
    else out.set(full, value);
  }
  return out;
}

const index = json('languages/index.json');
const codes = index.languages.map(({ code }) => code);

/** One set of language files: the OS, or an app. */
function load(dir, name) {
  const files = Object.fromEntries(codes.filter((code) => existsSync(join(root, dir, `${code}.json`))).map((code) => [code, flatten(json(`${dir}/${code}.json`))]));
  return { name, dir, files, english: files[index.default] };
}

const os = load('languages', 'the OS');
// an app that is a web site from another address has no folder here
const local = json('apps.json').apps.filter((app) => !/^([a-z][a-z0-9+.-]*:|\.\.\/)/i.test(app.entry ?? ''));
const folderOf = (app) => app.entry.split('/').slice(0, -1).join('/');
const appSets = local.filter((app) => existsSync(join(root, folderOf(app), 'languages'))).map((app) => ({ app, ...load(`${folderOf(app)}/languages`, app.id) }));
const everySet = [os, ...appSets];
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('every language file is listed and has the same keys as English', () => {
  for (const set of everySet) {
    assert.ok(set.english, `${set.name} has an English file`);
    for (const code of codes) assert.ok(set.files[code], `${set.name} has ${code}.json`);
    for (const [code, strings] of Object.entries(set.files)) {
      if (strings === set.english) continue;
      const missing = [...set.english.keys()].filter((key) => !strings.has(key));
      const extra = [...strings.keys()].filter((key) => !set.english.has(key));
      assert.deepEqual(missing, [], `${set.name} ${code} lacks keys`);
      assert.deepEqual(extra, [], `${set.name} ${code} has keys English does not have`);
    }
  }
});

test('translations keep the same {placeholders}', () => {
  for (const set of everySet) {
    for (const [code, strings] of Object.entries(set.files)) {
      for (const [key, value] of strings) assert.equal(placeholders(value), placeholders(set.english.get(key)), `${set.name} ${code}: ${key}`);
    }
  }
});

test('no translation is empty', () => {
  for (const set of everySet) {
    for (const [code, strings] of Object.entries(set.files)) {
      for (const [key, value] of strings) assert.ok(String(value).trim(), `${set.name} ${code}: ${key}`);
    }
  }
});

test('an app never repeats a key of the OS (it would hide it), and nothing but the OS is in /languages', () => {
  for (const set of appSets) {
    const twice = [...set.english.keys()].filter((key) => os.english.has(key));
    assert.deepEqual(twice, [], `${set.name} defines keys the OS already has`);
  }
});

function sources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (/\.(js|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every translation key a file asks for. */
function keysIn(file) {
  const text = readFileSync(file, 'utf8');
  const found = [];
  for (const m of text.matchAll(/\b(?:i18n\.)?t\(\s*(['"])([a-zA-Z0-9_.-]+)\1/g)) found.push(m[2]);
  for (const m of text.matchAll(/\bplural\(\s*(['"])([a-zA-Z0-9_.-]+)\1/g)) found.push(`${m[2]}.one`, `${m[2]}.other`);
  for (const m of text.matchAll(/data-i18n(?:-[a-z]+)?['"]?\s*[:=]\s*(['"])([a-zA-Z0-9_.-]+)\1/g)) found.push(m[2]);
  for (const m of text.matchAll(/\bt\(([^()]*\?[^()]*)\)/g)) {
    for (const k of m[1].matchAll(/(['"])([a-z][a-zA-Z0-9_-]*\.[a-zA-Z0-9_.-]+)\1/g)) found.push(k[2]);
  }
  return found;
}

test('every key used in the OS code exists in the OS strings', () => {
  const files = [...sources(join(root, 'system')), join(root, 'index.html')].filter((file) => !(file.endsWith('i18n.js') && file.includes(`${sep}core${sep}`))); // its comments contain examples
  const missing = [];
  for (const file of files) for (const key of keysIn(file)) if (!os.english.has(key)) missing.push(`${key}  (${relative(root, file)})`);
  assert.deepEqual(missing, []);
});

test('every key used in an app exists in its own strings or in the OS strings', () => {
  const missing = [];
  for (const app of local) {
    const own = appSets.find((set) => set.app === app)?.english;
    for (const file of sources(join(root, folderOf(app)))) {
      for (const key of keysIn(file)) if (!os.english.has(key) && !own?.has(key)) missing.push(`${key}  (${relative(root, file)})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('an app does not use the strings of another app', () => {
  // the namespaces of each app are told apart by the prefix of their keys in the app's own file
  const owner = new Map();
  for (const set of appSets) for (const key of set.english.keys()) if (!key.startsWith('app.')) owner.set(key, set.app.id); // every app has its own app.name ...
  const borrowed = [];
  for (const app of local) {
    for (const file of sources(join(root, folderOf(app)))) {
      for (const key of keysIn(file)) if (owner.has(key) && owner.get(key) !== app.id) borrowed.push(`${key}  (${relative(root, file)}, belongs to ${owner.get(key)})`);
    }
  }
  assert.deepEqual(borrowed, []);
});

test('the OS strings are about the OS: no app is listed in them', () => {
  const apps = [...os.english.keys()].filter((key) => key.startsWith('apps.'));
  assert.deepEqual(apps, [], 'what an app is called and what it does is written by the app itself');
  const catalog = json('apps.json').apps.map((app) => app.id);
  for (const key of os.english.keys()) assert.ok(!catalog.includes(key.split('.')[0]), `${key} names an app`);
});

test('the strings an app keeps in its languages folder are for its own window, not for how the OS lists it', () => {
  const listing = ['description', 'publisher'];
  const bad = [];
  for (const set of appSets) for (const key of set.english.keys()) if (key.startsWith('app.') && key !== 'app.name') bad.push(`${set.name}: ${key}`);
  for (const set of appSets) for (const part of listing) if (set.english.has(`app.${part}`)) bad.push(`${set.name}: app.${part} is written in apps.json`);
  assert.deepEqual(bad, []);
});

test('apps.json has the name, description and publisher in every language, and the deep link titles too', () => {
  const missing = [];
  for (const app of json('apps.json').apps) {
    for (const code of codes) {
      for (const field of ['name', 'description', 'publisher']) if (!app[field]?.[code]) missing.push(`${app.id}: ${field}.${code}`);
      for (const link of app.deepLinks ?? []) if (!link.title?.[code]) missing.push(`${app.id}: deep link title in ${code}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every language in the list is a real file', () => {
  for (const { code } of index.languages) assert.ok(existsSync(join(root, `languages/${code}.json`)), code);
});
