import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(join(root, file), 'utf8');
const catalog = JSON.parse(read('apps.json')).apps;
// the apps that live in a folder of this project (an app that is a web site has none)
const local = catalog.filter((app) => !/^([a-z][a-z0-9+.-]*:|\.\.\/)/i.test(app.entry ?? ''));
const ids = local.map((app) => app.id);

/** Names of all icons that exist anywhere: in /icons or in an app's own folder. */
const everyIconName = new Set();
for (const dir of ['icons', ...readdirSync(join(root, 'apps')).map((id) => `apps/${id}/icons`)]) {
  if (existsSync(join(root, dir))) for (const f of readdirSync(join(root, dir))) if (f.endsWith('.svg')) everyIconName.add(f.slice(0, -4));
}

test('apps.json lists every app folder, once', () => {
  assert.equal(new Set(catalog.map((app) => app.id)).size, catalog.length, 'no duplicates');
  const folders = readdirSync(join(root, 'apps'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  assert.deepEqual([...ids].sort(), folders.sort());
});

for (const id of ids) {
  test(`app "${id}": its entry in apps.json and its files`, () => {
    const app = local.find((item) => item.id === id);
    assert.ok(app.name?.['en-US'], 'a name in English');
    assert.match(app.version, /^\d+\.\d+\.\d+$/);
    const folder = dirname(app.entry);
    assert.ok(existsSync(join(root, folder)), folder);
    assert.ok(existsSync(join(root, app.entry)), app.entry);
    assert.ok(existsSync(join(root, app.icon)), app.icon);
    assert.ok(!existsSync(join(root, folder, 'manifest.json')), 'no manifest.json: everything is in apps.json');
    const w = app.window;
    assert.ok(w.width >= w.minWidth && w.height >= w.minHeight, 'the window is not smaller than its minimum');
  });

  test(`app "${id}": every icon it names is in its own icons folder`, () => {
    const missing = [];
    const check = (name, from) => {
      if (!existsSync(join(root, 'apps', id, 'icons', `${name}.svg`))) missing.push(`${name} (${from})`);
    };
    const dir = join(root, 'apps', id);
    for (const file of readdirSync(dir).filter((f) => /\.(js|html)$/.test(f))) {
      const text = readFileSync(join(dir, file), 'utf8');
      // icons written in HTML, and the calls of the SDK that take an icon name as their first argument
      for (const m of text.matchAll(/data-icon="([a-z0-9-]+)"/g)) check(m[1], file);
      for (const m of text.matchAll(/\b(?:icon|picture|iconUrl|setIcon)\(\s*(?:[a-zA-Z.]+,\s*)?'([a-z0-9-]+)'/g)) check(m[1], file);
      for (const m of text.matchAll(/src="icons\/([a-z0-9-]+)\.svg"/g)) check(m[1], file);
      // icon names handed to the app's own helpers (button('delete', ...), { icon: 'copy' }, { mono: 'home' }).
      // These can also be plain words, so only names that exist as an icon somewhere are taken seriously.
      for (const m of text.matchAll(/(?:\bicon|\bmono|\bimg):\s*'([a-z0-9-]+)'|\bbutton\(\s*'([a-z0-9-]+)'/g)) {
        const name = m[1] ?? m[2];
        if (everyIconName.has(name)) check(name, file);
      }
    }
    assert.deepEqual(missing, []);
  });
}

test('the icons of the OS folder are all valid SVG files', () => {
  for (const file of readdirSync(join(root, 'icons')).filter((f) => f.endsWith('.svg'))) {
    const svg = read(`icons/${file}`);
    assert.match(svg, /^<svg[\s>]/, file);
    assert.match(svg, /<\/svg>\s*$/, file);
  }
});

test('no code points at the old folder layout', () => {
  const stale = ['system/css', 'system/js', 'apps/apps.json'];
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'tests', '.claude'].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|html|css|json)$/.test(entry.name)) {
        const text = readFileSync(full, 'utf8');
        for (const s of stale) if (text.includes(s)) found.push(`${s} in ${full.slice(root.length)}`);
      }
    }
  };
  walk(root);
  assert.deepEqual(found, []);
});

test('the apps the system relies on cannot be uninstalled', () => {
  // the shell opens files, settings, the terminal, the task manager and links with the app that has these roles
  const needed = ['file-manager', 'settings', 'terminal', 'text-editor', 'image-viewer', 'media-player', 'task-manager', 'store', 'browser'];
  for (const role of needed) {
    const holders = catalog.filter((app) => app.roles?.includes(role));
    assert.ok(holders.length, `an app has the role ${role}`);
    for (const app of holders) assert.ok(!app.behaviors?.includes('removable'), `${app.id} (${role}) must not have "removable" in its behaviors`);
  }
});

test('every app tells, in every language of the OS, its name, description and publisher', () => {
  const codes = JSON.parse(read('languages/index.json')).languages.map((l) => l.code);
  for (const app of catalog) {
    for (const code of codes) {
      for (const field of ['name', 'description', 'publisher']) {
        assert.ok(typeof app[field]?.[code] === 'string' && app[field][code].trim(), `${app.id}: ${field}.${code}`);
      }
    }
    // one text per language, under the name of the text: not the other way round
    assert.ok(!('info' in app), `${app.id}: "info" is gone`);
  }
  for (const app of catalog.filter((item) => item.id.endsWith('craft'))) assert.equal(app.publisher['en-US'], 'ArtCraft', app.id);
});

test('behaviors are known ones, and an app that starts with the system can put an icon in the tray and handles having no window', () => {
  const known = ['singleInstance', 'removable', 'installed', 'startup'];
  for (const app of catalog) {
    assert.ok(Array.isArray(app.behaviors), `${app.id} has behaviors`);
    for (const name of app.behaviors) assert.ok(known.includes(name), `${app.id}: unknown behavior ${name}`);
  }
  for (const app of local.filter((item) => item.behaviors.includes('startup'))) {
    assert.ok(app.permissions.includes('tray'), `${app.id} starts with the system, so it needs the "tray" permission`);
    assert.ok(app.permissions.includes('launch'), `${app.id} needs "launch" to open its window from the tray`);
    assert.match(read(app.entry.replace(/index\.html$/, 'app.js')), /os\.background/, `${app.id} does not look at os.background`);
  }
});

test('the colour of a store banner is a list of #rrggbb, one or more (several make a gradient)', () => {
  for (const app of catalog) {
    const color = app.store?.color;
    if (color === undefined) continue;
    assert.ok(Array.isArray(color) && color.length >= 1, `${app.id}: store.color is a list`);
    for (const value of color) assert.match(value, /^#[0-9a-f]{6}$/i, `${app.id}: ${value}`);
  }
});

test('every app has categories (tags) that the Store has a name for in every language', () => {
  const languages = ['en-US', 'zh-CN', 'ar-SA'];
  for (const app of catalog) {
    assert.ok(Array.isArray(app.categories) && app.categories.length >= 1, `${app.id} has categories`);
    assert.equal(new Set(app.categories).size, app.categories.length, `${app.id} repeats a category`);
    assert.ok(!('category' in (app.store ?? {})), `${app.id} still has "store.category"`);
    for (const code of languages) {
      const names = JSON.parse(read(`apps/store/languages/${code}.json`)).store.categories;
      for (const tag of app.categories) assert.ok(typeof names[tag] === 'string' && tag !== 'all', `${app.id}: "${tag}" has no name in ${code}`);
    }
  }
});
