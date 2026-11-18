import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Arabic reads from right to left. The page is mirrored by dir="rtl" on <html>, which only works
 * when the CSS says "start" and "end" instead of "left" and "right".
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(join(root, file), 'utf8');
const languages = JSON.parse(read('languages/index.json')).languages;

const sheets = [
  ...readdirSync(join(root, 'style')).filter((f) => f.endsWith('.css')).map((f) => `style/${f}`),
  ...readdirSync(join(root, 'apps')).map((id) => `apps/${id}/style.css`).filter((f) => existsSync(join(root, f)))
].filter((f) => f !== 'style/rtl.css'); // rtl.css is the one place that talks about sides on purpose

test('every language says in which direction it is written, and Arabic is right to left', () => {
  for (const { code, dir } of languages) assert.ok(['ltr', 'rtl'].includes(dir), `${code} has a "dir"`);
  assert.equal(languages.find((l) => l.code === 'ar-SA')?.dir, 'rtl');
  assert.ok(languages.some((l) => l.dir === 'ltr'));
});

test('the CSS uses start and end, not left and right, for margins, padding, borders and text', () => {
  const physical = /\b(?:margin|padding)-(?:left|right)\b|\bborder-(?:left|right)(?=[:-])|text-align:\s*(?:left|right)\b|\bfloat:\s*(?:left|right)\b/;
  for (const file of sheets) {
    const lines = read(file).split('\n');
    lines.forEach((line, i) => assert.ok(!physical.test(line), `${file}:${i + 1} says left/right: ${line.trim()}`));
  }
});

test('a position is given from the start or the end, unless it is a stretch, a centring or an edge of a window', () => {
  const lonely = [];
  for (const file of sheets) {
    for (const [, selector, body] of read(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/@keyframes|@media|window-resize/.test(selector) || (file === 'style/desktop.css' && /dicon/.test(selector))) continue;
      const has = (name) => new RegExp(`(^|[;\\s])${name}\\s*:`).test(body);
      const left = /(?:^|[;\s])left\s*:\s*([^;]+)/.exec(body)?.[1]?.trim();
      if (has('left') && has('right')) continue; // a stretch
      if (has('left') && left !== '50%') lonely.push(`${file}: ${selector.trim().split('\n').pop()} { left }`);
      if (has('right')) lonely.push(`${file}: ${selector.trim().split('\n').pop()} { right }`);
    }
  }
  assert.deepEqual(lonely, []);
});

test('the pages that need it keep numbers and the console from left to right', () => {
  assert.match(read('apps/calculator/style.css'), /html\[dir="rtl"\][^{]*\.keys[^{]*\{[^}]*direction:\s*ltr/);
  assert.match(read('apps/command-prompt/style.css'), /html\[dir="rtl"\][^{]*\.viewport[^{]*\{[^}]*direction:\s*ltr/);
});

test('both the shell and the app pages load the stylesheet with the right-to-left rules', () => {
  assert.match(read('index.html'), /style\/rtl\.css/);
  assert.match(read('style/app.css'), /rtl\.css/);
});
