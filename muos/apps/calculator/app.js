import { os, t, i18n, h, hydrateIcons } from 'webos/sdk/app.js';
import { evaluate, CalcError } from './scientific.js';
import { CATEGORY_IDS, unitsOf, convert } from './convert.js';
import * as pg from './programmer.js';
import { difference, shift, parseDay, toDay } from './dates.js';

await os.ready;

const $ = (id) => document.getElementById(id);
const calcEl = $('calc');
const valueEl = $('value');
const exprEl = $('expr');
const keysEl = $('keys');
const historyEl = $('history');
const historyList = $('history-list');
const displayEl = $('display');
const basesEl = $('bases');
const convEl = $('conv');
const dateEl = $('date');
const memoryBar = $('memory-bar');

const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷', mod: 'Mod', and: 'AND', or: 'OR', xor: 'XOR', nand: 'NAND', nor: 'NOR', lsh: '<<', rsh: '>>' };

/** The calculator's state: what is typed, the pending operation, the history and the memory. */
const s = { mode: 'standard', cur: '0', acc: null, op: null, fresh: true, error: null, expr: '', history: [], memory: [], panel: 'history' };

/** Scientific mode types a whole expression (with brackets) and evaluates it with "=". */
const sci = { text: '', result: null, degrees: true };

/** Programmer mode: BigInt numbers of a fixed word size. */
const p = { base: 10, bits: 64, entry: '', cur: 0n, acc: null, op: null, fresh: true, expr: '' };

/** Unit converter: the category, the two units and the typed number. */
const DEFAULT_UNITS = {
  length: ['meter', 'foot'],
  weight: ['kilogram', 'pound'],
  temperature: ['celsius', 'fahrenheit'],
  volume: ['liter', 'gallon'],
  area: ['squareMeter', 'squareFoot'],
  speed: ['kilometerPerHour', 'milePerHour'],
  time: ['hour', 'minute'],
  energy: ['kilojoule', 'kilocalorie'],
  power: ['kilowatt', 'horsepower'],
  data: ['megabyte', 'gigabyte'],
  pressure: ['bar', 'psi'],
  angle: ['degree', 'radian']
};
const conv = { category: 'length', units: {}, text: '0', fresh: true };
const convUnits = () => conv.units[conv.category] ?? DEFAULT_UNITS[conv.category];

const decimal = () => i18n.number(1.1).charAt(1);

/** Round away binary noise (0.1 + 0.2) and write the number in the current language. */
function fmt(n) {
  const clean = Number(Number(n).toPrecision(15));
  if (Math.abs(clean) >= 1e16 || (clean !== 0 && Math.abs(clean) < 1e-9)) return clean.toExponential(6).replace(/\.?0+e/, 'e');
  return i18n.number(clean, { maximumFractionDigits: 12, useGrouping: true });
}

/** Text of the number being typed, keeping a trailing "." or zeros. */
function typedText(text) {
  const [int, frac] = text.split('.');
  const neg = int.startsWith('-');
  const grouped = i18n.number(Number(int.replace('-', '')), { useGrouping: true, maximumFractionDigits: 0 });
  return `${neg ? '-' : ''}${grouped}${frac !== undefined ? decimal() + frac : ''}`;
}
const typed = () => typedText(s.cur);

const pretty = (text) => text.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');

const fitFont = (len, { max = 48, min = 24, from = 9, step = 3 } = {}) => `${Math.max(min, Math.min(max, max - (len - from) * step))}px`;

/* ------------------------------ scientific mode ------------------------------ */

function renderSci() {
  valueEl.classList.toggle('is-error', !!s.error);
  valueEl.textContent = s.error ? t(s.error) : sci.result !== null ? fmt(sci.result) : sci.text ? pretty(sci.text) : '0';
  exprEl.textContent = s.expr;
  valueEl.style.fontSize = s.error ? '' : fitFont(valueEl.textContent.length, { max: 40, min: 20, from: 12, step: 2 });
}

function sciClear() {
  Object.assign(s, { error: null, expr: '' });
  sci.text = '';
  sci.result = null;
}

/** Add a token. After "=", an operator goes on with the result, anything else starts anew. */
function sciAppend(token) {
  if (s.error) sciClear();
  if (sci.result !== null) {
    sci.text = /^([+\-*/^%!]|mod)/.test(token) ? String(sci.result) : '';
    sci.result = null;
    s.expr = '';
  }
  sci.text += token;
}

function sciBackspace() {
  if (s.error) return sciClear();
  if (sci.result !== null) return;
  sci.text = sci.text.replace(/(sin\(|cos\(|tan\(|ln\(|log\(|√\(|abs\(| mod |.)$/, '');
}

const closeBrackets = () => sci.text + ')'.repeat(Math.max(0, (sci.text.match(/\(/g) || []).length - (sci.text.match(/\)/g) || []).length));

function sciEquals() {
  if (s.error || sci.result !== null || !sci.text) return;
  const source = closeBrackets();
  try {
    const result = evaluate(source, { degrees: sci.degrees });
    pushHistory({ line: `${pretty(source)} =`, result, mode: 'sci' });
    s.expr = `${pretty(source)} =`;
    sci.result = result;
    sci.text = '';
  } catch (err) {
    if (!(err instanceof CalcError)) throw err;
    s.error = err.message;
    sci.text = '';
    s.expr = '';
  }
}

function sciNegate() {
  if (sci.result !== null) {
    sci.text = String(sci.result);
    sci.result = null;
    s.expr = '';
  }
  sci.text = sci.text.startsWith('-') ? sci.text.slice(1) : `-${sci.text}`;
}

/* ------------------------------- standard mode ------------------------------- */

function clearAll() {
  Object.assign(s, { cur: '0', acc: null, op: null, fresh: true, error: null, expr: '', justTyped: false });
}

function compute(a, op, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? (a === 0 ? 'calculator.invalid' : 'calculator.divZero') : a / b;
    default: return b;
  }
}

function fail(key) {
  s.error = key;
  s.acc = null;
  s.op = null;
  s.expr = '';
  s.fresh = true;
}

const num = () => Number(s.cur);

function digit(d) {
  if (s.error) clearAll();
  if (s.fresh) {
    s.cur = d;
    s.fresh = false;
  } else if (s.cur.replace(/[-.]/g, '').length < 16) {
    s.cur = s.cur === '0' ? d : s.cur === '-0' ? `-${d}` : s.cur + d;
  }
  s.justTyped = true;
}

function dot() {
  if (s.error) clearAll();
  if (s.fresh) {
    s.cur = '0.';
    s.fresh = false;
  } else if (!s.cur.includes('.')) s.cur += '.';
  s.justTyped = true;
}

function operator(op) {
  if (s.error) return;
  if (s.op && !s.fresh) {
    const r = compute(s.acc, s.op, num());
    if (typeof r === 'string') return fail(r);
    s.acc = r;
    s.cur = String(r);
  } else if (s.acc === null || !s.op) s.acc = num();
  s.op = op;
  s.fresh = true;
  s.justTyped = false;
  s.expr = `${fmt(s.acc)} ${SYMBOL[op]}`;
}

function equals() {
  if (s.error) return;
  if (!s.op) {
    s.expr = '';
    s.fresh = true;
    s.justTyped = false;
    return;
  }
  const a = s.acc;
  const b = num();
  const r = compute(a, s.op, b);
  const line = `${fmt(a)} ${SYMBOL[s.op]} ${fmt(b)} =`;
  if (typeof r === 'string') return fail(r);
  pushHistory({ line, result: r, mode: 'standard' });
  s.expr = line;
  s.cur = String(Number(r.toPrecision(15)));
  s.acc = null;
  s.op = null;
  s.fresh = true;
  s.justTyped = false;
}

function unary(kind) {
  if (s.error) return;
  const x = num();
  let r;
  let label;
  if (kind === 'neg') {
    s.cur = s.cur.startsWith('-') ? s.cur.slice(1) : s.cur === '0' ? '-0' : `-${s.cur}`;
    return;
  }
  if (kind === 'percent') {
    r = s.acc === null ? 0 : (s.acc * x) / 100;
    label = fmt(r);
  } else if (kind === 'sqr') {
    r = x * x;
    label = `sqr(${fmt(x)})`;
  } else if (kind === 'sqrt') {
    if (x < 0) return fail('calculator.invalid');
    r = Math.sqrt(x);
    label = `√(${fmt(x)})`;
  } else {
    if (x === 0) return fail('calculator.divZero');
    r = 1 / x;
    label = `1/(${fmt(x)})`;
  }
  s.cur = String(Number(r.toPrecision(15)));
  s.fresh = true;
  s.justTyped = false;
  if (kind !== 'percent') s.expr = s.op ? `${fmt(s.acc)} ${SYMBOL[s.op]} ${label}` : label;
}

function backspace() {
  if (s.error) return clearAll();
  if (s.fresh) return;
  s.cur = s.cur.length > 1 && !(s.cur.length === 2 && s.cur.startsWith('-')) ? s.cur.slice(0, -1) : '0';
}

const clearEntry = () => {
  if (s.error) clearAll();
  else {
    s.cur = '0';
    s.fresh = true;
    s.justTyped = true;
  }
};

/* ----------------------------------- memory ---------------------------------- */

/** The number on the display (the result, or what the typed expression comes to). */
function currentNumber() {
  if (s.mode === 'sci') {
    if (sci.result !== null) return sci.result;
    if (!sci.text) return 0;
    try {
      return evaluate(closeBrackets(), { degrees: sci.degrees });
    } catch {
      return null;
    }
  }
  return s.error ? null : num();
}

const memory = {
  clear() {
    s.memory = [];
  },
  recall() {
    if (!s.memory.length) return;
    if (s.mode === 'sci') sciAppend(String(s.memory[0]));
    else {
      if (s.error) clearAll();
      s.cur = String(s.memory[0]);
      s.fresh = true;
      s.justTyped = false;
    }
  },
  add(sign) {
    const v = currentNumber();
    if (v === null) return;
    if (!s.memory.length) s.memory.unshift(0);
    s.memory[0] = Number((s.memory[0] + sign * v).toPrecision(15));
    if (s.mode !== 'sci') (s.fresh = true), (s.justTyped = false);
  },
  store() {
    const v = currentNumber();
    if (v === null) return;
    s.memory.unshift(v);
    s.memory.length = Math.min(s.memory.length, 20);
    if (s.mode !== 'sci') (s.fresh = true), (s.justTyped = false);
  }
};

function renderMemoryBar() {
  const visible = s.mode === 'standard' || s.mode === 'sci';
  memoryBar.hidden = !visible;
  if (!visible) return;
  const empty = !s.memory.length;
  const item = (label, tip, action, disabled = false) => {
    const b = h('button', { class: 'mem-btn', type: 'button', tabIndex: -1, disabled, 'aria-label': tip, 'data-tip': tip }, label);
    b.addEventListener('click', () => press(action));
    return b;
  };
  memoryBar.replaceChildren(
    item('MC', t('calculator.memory.clear'), memory.clear, empty),
    item('MR', t('calculator.memory.recall'), memory.recall, empty),
    item('M+', t('calculator.memory.add'), () => memory.add(1)),
    item('M−', t('calculator.memory.subtract'), () => memory.add(-1)),
    item('MS', t('calculator.memory.store'), memory.store),
    item('M▾', t('calculator.panel.memory'), () => showPanel('memory'), false)
  );
}

/* ---------------------------------- programmer ------------------------------- */

const fmtP = (n, base = p.base) => (base === 2 ? pg.groupBinary(pg.format(n, base, p.bits)) : pg.format(n, base, p.bits));

function pFail(err) {
  if (!(err instanceof pg.ProgrammerError)) throw err;
  s.error = err.message;
  Object.assign(p, { acc: null, op: null, fresh: true, expr: '' });
}

function pClear() {
  Object.assign(p, { entry: '', cur: 0n, acc: null, op: null, fresh: true, expr: '' });
  s.error = null;
}

function pDigit(d) {
  if (s.error) pClear();
  if (!pg.isDigit(d, p.base)) return;
  if (p.fresh) {
    p.entry = d;
    p.fresh = false;
  } else if (p.entry.length < 64) p.entry += d;
  p.cur = pg.parseDigits(p.entry, p.base, p.bits);
}

function pOperator(op) {
  if (s.error) return;
  try {
    if (p.op && !p.fresh) {
      p.acc = pg.applyOp(p.acc, p.op, p.cur, p.bits);
      p.cur = p.acc;
    } else if (p.acc === null || !p.op) p.acc = p.cur;
  } catch (err) {
    return pFail(err);
  }
  p.op = op;
  p.fresh = true;
  p.expr = `${fmtP(p.acc)} ${SYMBOL[op]}`;
}

function pEquals() {
  if (s.error) return;
  if (!p.op) {
    p.expr = '';
    p.fresh = true;
    return;
  }
  try {
    const line = `${fmtP(p.acc)} ${SYMBOL[p.op]} ${fmtP(p.cur)} =`;
    const r = pg.applyOp(p.acc, p.op, p.cur, p.bits);
    pushHistory({ line, text: fmtP(r), value: r, mode: 'prog' });
    p.expr = line;
    p.cur = r;
    p.acc = null;
    p.op = null;
    p.fresh = true;
  } catch (err) {
    pFail(err);
  }
}

function pUnary(kind) {
  if (s.error) return;
  p.cur = kind === 'not' ? pg.not(p.cur, p.bits) : pg.negate(p.cur, p.bits);
  p.fresh = true;
}

function pBackspace() {
  if (s.error) return pClear();
  if (p.fresh) return;
  p.entry = p.entry.slice(0, -1);
  p.cur = pg.parseDigits(p.entry, p.base, p.bits);
}

function setBase(base) {
  p.base = base;
  p.fresh = true;
  buildKeys();
  render();
}

function cycleBits() {
  const at = pg.WORD_SIZES.indexOf(p.bits);
  p.bits = pg.WORD_SIZES[(at + 1) % pg.WORD_SIZES.length];
  p.cur = pg.wrap(p.cur, p.bits);
  if (p.acc !== null) p.acc = pg.wrap(p.acc, p.bits);
  render();
}

const BASE_NAMES = { hex: 'HEX', dec: 'DEC', oct: 'OCT', bin: 'BIN' };
const BITS_NAMES = { 64: 'QWORD', 32: 'DWORD', 16: 'WORD', 8: 'BYTE' };

function renderProgrammer() {
  valueEl.classList.toggle('is-error', !!s.error);
  valueEl.textContent = s.error ? t(s.error) : fmtP(p.cur);
  exprEl.textContent = p.expr;
  valueEl.style.fontSize = s.error ? '' : fitFont(valueEl.textContent.length, { max: 36, min: 16, from: 14, step: 1.5 });
  basesEl.replaceChildren(
    ...Object.entries(pg.BASES).map(([name, base]) => {
      const row = h('button', { class: `base-row${p.base === base ? ' is-active' : ''}`, type: 'button', tabIndex: -1 }, h('span', { class: 'base-name' }, BASE_NAMES[name]), h('span', { class: 'base-value' }, fmtP(p.cur, base)));
      row.addEventListener('click', () => setBase(base));
      return row;
    }),
    h('button', { class: 'base-bits', type: 'button', tabIndex: -1, 'data-tip': t('calculator.wordSize'), onclick: cycleBits }, BITS_NAMES[p.bits])
  );
}

/* ------------------------------------ converter ------------------------------ */

const convValue = () => Number(conv.text);

function convDigit(d) {
  if (conv.fresh) {
    conv.text = d;
    conv.fresh = false;
  } else if (conv.text.replace(/[-.]/g, '').length < 15) conv.text = conv.text === '0' ? d : conv.text === '-0' ? `-${d}` : conv.text + d;
}

function convDot() {
  if (conv.fresh) {
    conv.text = '0.';
    conv.fresh = false;
  } else if (!conv.text.includes('.')) conv.text += '.';
}

function convNeg() {
  conv.text = conv.text.startsWith('-') ? conv.text.slice(1) : conv.text === '0' ? '-0' : `-${conv.text}`;
}

function convBack() {
  if (conv.fresh) return;
  conv.text = conv.text.length > 1 && !(conv.text.length === 2 && conv.text.startsWith('-')) ? conv.text.slice(0, -1) : '0';
}

const convClear = () => Object.assign(conv, { text: '0', fresh: true });

function renderConverter() {
  const [from, to] = convUnits();
  const result = convert(conv.category, from, to, convValue());
  const select = (current, onChange) => {
    const el = h('select', { class: 'input unit-select', 'aria-label': t('calculator.unit') }, unitsOf(conv.category).map((unit) => h('option', { value: unit, selected: unit === current }, t(`calculator.units.${unit}`))));
    el.addEventListener('change', () => {
      onChange(el.value);
      renderConverter();
    });
    return el;
  };
  const swap = h('button', { class: 'icon-btn swap', type: 'button', 'aria-label': t('calculator.swap'), 'data-tip': t('calculator.swap'), tabIndex: -1 }, '⇅');
  swap.addEventListener('click', () => {
    conv.units[conv.category] = [to, from];
    conv.text = String(Number(result.toPrecision(12)));
    conv.fresh = true;
    renderConverter();
  });
  const inText = conv.fresh ? fmt(convValue()) : typedText(conv.text);
  convEl.replaceChildren(
    h('div', { class: 'conv-row is-input' }, h('div', { class: 'conv-value', style: { fontSize: fitFont(inText.length, { max: 36, min: 20, from: 10, step: 2 }) } }, inText), select(from, (v) => (conv.units[conv.category] = [v, to]))),
    swap,
    h('div', { class: 'conv-row' }, h('div', { class: 'conv-value', style: { fontSize: fitFont(fmt(result).length, { max: 36, min: 20, from: 10, step: 2 }) } }, fmt(result)), select(to, (v) => (conv.units[conv.category] = [from, v])))
  );
}

/* ---------------------------------- date calculation ------------------------- */

const dateState = { kind: 'diff', from: toDay(new Date()), to: toDay(new Date()), sign: 1, years: 0, months: 0, days: 0 };

function dateResult() {
  const a = parseDay(dateState.from);
  if (!a) return null;
  if (dateState.kind === 'diff') {
    const b = parseDay(dateState.to);
    if (!b) return null;
    const d = difference(a, b);
    if (d.total === 0) return { main: t('calculator.date.same'), sub: '' };
    const parts = [];
    if (d.years) parts.push(i18n.plural('calculator.date.years', d.years));
    if (d.months) parts.push(i18n.plural('calculator.date.months', d.months));
    if (d.days) parts.push(i18n.plural('calculator.date.days', d.days));
    return { main: parts.join(', '), sub: `${i18n.plural('calculator.date.totalDays', d.total)}` };
  }
  const out = shift(a, { years: dateState.years, months: dateState.months, days: dateState.days }, dateState.sign);
  return { main: i18n.date(out, { dateStyle: 'full' }), sub: '' };
}

function renderDate() {
  const field = (label, control) => h('label', { class: 'date-field' }, h('span', null, label), control);
  const dateInput = (key) => {
    const el = h('input', { class: 'input', type: 'date', value: dateState[key], 'aria-label': t(`calculator.date.${key}`) });
    el.addEventListener('input', () => {
      dateState[key] = el.value;
      updateResult();
    });
    return el;
  };
  const numInput = (key) => {
    const el = h('input', { class: 'input', type: 'number', min: 0, max: 9999, value: String(dateState[key]), 'aria-label': t(`calculator.date.${key}Label`) });
    el.addEventListener('input', () => {
      dateState[key] = Math.max(0, Math.floor(Number(el.value) || 0));
      updateResult();
    });
    return field(t(`calculator.date.${key}Label`), el);
  };
  const kind = h('select', { class: 'input' }, ['diff', 'add'].map((value) => h('option', { value, selected: dateState.kind === value }, t(`calculator.date.kind.${value}`))));
  kind.addEventListener('change', () => {
    dateState.kind = kind.value;
    renderDate();
  });
  const result = h('div', { class: 'date-result', role: 'status' });
  const updateResult = () => {
    const r = dateResult();
    result.replaceChildren(r ? h('strong', null, r.main) : t('calculator.invalid'), r?.sub ? h('small', null, r.sub) : null);
  };
  const body = [field(t('calculator.date.kindLabel'), kind), field(t('calculator.date.from'), dateInput('from'))];
  if (dateState.kind === 'diff') body.push(field(t('calculator.date.to'), dateInput('to')));
  else {
    const sign = h('select', { class: 'input' }, [1, -1].map((value) => h('option', { value: String(value), selected: dateState.sign === value }, t(value > 0 ? 'calculator.date.add' : 'calculator.date.subtract'))));
    sign.addEventListener('change', () => {
      dateState.sign = Number(sign.value);
      updateResult();
    });
    body.push(field(t('calculator.date.operation'), sign), h('div', { class: 'date-triple' }, numInput('years'), numInput('months'), numInput('days')));
  }
  dateEl.replaceChildren(...body, h('div', { class: 'date-result-title' }, t('calculator.date.result')), result);
  updateResult();
}

/* ------------------------------------- keys ---------------------------------- */

const KEYS = [
  ['%', () => unary('percent')], ['CE', clearEntry], ['C', clearAll], ['⌫', backspace],
  ['¹⁄ₓ', () => unary('inv')], ['x²', () => unary('sqr')], ['²√x', () => unary('sqrt')], ['÷', () => operator('/')],
  ['7'], ['8'], ['9'], ['×', () => operator('*')],
  ['4'], ['5'], ['6'], ['−', () => operator('-')],
  ['1'], ['2'], ['3'], ['+', () => operator('+')],
  ['±', () => unary('neg')], ['0'], ['.', dot], ['=', equals]
];

/** [label, token to type] of the extra keys above the number pad in scientific mode */
const SCI_KEYS = () => [
  ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], [sci.degrees ? 'DEG' : 'RAD', null],
  ['ln', 'ln('], ['log', 'log('], ['xʸ', '^'], ['n!', '!'],
  ['π', 'π'], ['e', 'e'], ['(', '('], [')', ')'],
  ['√', '√('], ['x²', '^2'], ['|x|', 'abs('], ['mod', ' mod ']
];

const SCI_PAD = () => [
  ['C', sciClear], ['⌫', sciBackspace], ['%', () => sciAppend('%')], ['÷', () => sciAppend('/')],
  ['7'], ['8'], ['9'], ['×', () => sciAppend('*')],
  ['4'], ['5'], ['6'], ['−', () => sciAppend('-')],
  ['1'], ['2'], ['3'], ['+', () => sciAppend('+')],
  ['±', sciNegate], ['0'], ['.', () => sciAppend('.')], ['=', sciEquals]
];

/** Programmer keys: [label, action, extra class, span]. */
const PROG_KEYS = () => {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'].map((d) => [d, () => pDigit(d), ' is-func']);
  const num = (d) => [d, () => pDigit(d), ' is-digit'];
  return [
    ...letters,
    ['AND', () => pOperator('and'), ' is-func'], ['OR', () => pOperator('or'), ' is-func'], ['XOR', () => pOperator('xor'), ' is-func'], ['NOT', () => pUnary('not'), ' is-func'], ['<<', () => pOperator('lsh'), ' is-func'], ['>>', () => pOperator('rsh'), ' is-func'],
    num('7'), num('8'), num('9'), ['÷', () => pOperator('/')], ['C', pClear], ['⌫', pBackspace],
    num('4'), num('5'), num('6'), ['×', () => pOperator('*')], ['Mod', () => pOperator('mod'), ' is-func'], ['NAND', () => pOperator('nand'), ' is-func'],
    num('1'), num('2'), num('3'), ['−', () => pOperator('-')], ['±', () => pUnary('neg')], ['NOR', () => pOperator('nor'), ' is-func'],
    num('0'), ['+', () => pOperator('+'), '', 3], ['=', pEquals, ' is-equals', 2]
  ];
};

const CONV_KEYS = () => [
  ['CE', convClear], ['C', convClear], ['⌫', convBack],
  ['7'], ['8'], ['9'], ['4'], ['5'], ['6'], ['1'], ['2'], ['3'],
  ['±', convNeg], ['0'], ['.', convDot]
];

function press(fn) {
  fn();
  render();
}

function buildKeys() {
  keysEl.replaceChildren();
  keysEl.hidden = s.mode === 'date';
  keysEl.className = `keys${s.mode === 'sci' ? ' is-sci' : ''}${s.mode === 'prog' ? ' is-prog' : ''}${s.mode === 'conv' ? ' is-conv' : ''}`;
  const add = (label, action, extra = '', span = 1, disabled = false) => {
    const button = h('button', { class: `key${extra}`, type: 'button', tabIndex: -1, disabled, style: span > 1 ? { gridColumn: `span ${span}` } : null }, label);
    button.addEventListener('click', () => press(action));
    keysEl.append(button);
  };
  const pad = (rows, handler) => {
    for (const [label, fn] of rows) {
      const isDigit = /^\d$/.test(label);
      add(label === '.' ? decimal() : label, isDigit ? () => handler(label) : label === '.' ? () => handler('.') : fn, `${isDigit ? ' is-digit' : ''}${label === '=' ? ' is-equals' : ''}`);
    }
  };
  if (s.mode === 'sci') {
    for (const [label, token] of SCI_KEYS()) add(label, token === null ? () => ((sci.degrees = !sci.degrees), buildKeys()) : () => sciAppend(token), ' is-func');
    return pad(SCI_PAD(), sciAppend);
  }
  if (s.mode === 'prog') {
    for (const [label, action, extra, span] of PROG_KEYS()) {
      const isHex = /^[A-F]$/.test(label) && extra === ' is-func';
      const isNum = /^\d$/.test(label);
      add(label, action, extra, span ?? 1, (isHex || isNum) && !pg.isDigit(label, p.base));
    }
    return;
  }
  if (s.mode === 'conv') return pad(CONV_KEYS(), convDigit);
  pad(KEYS, digit);
}

/* ----------------------------------- history ---------------------------------- */

function pushHistory(entry) {
  s.history.unshift(entry);
  s.history.length = Math.min(s.history.length, 30);
}

function showPanel(name) {
  s.panel = name;
  historyEl.hidden = false;
  renderPanel();
}

function renderPanel() {
  const tabs = $('panel-tabs');
  tabs.replaceChildren(
    ...['history', 'memory'].map((name) => {
      const b = h('button', { class: `panel-tab${s.panel === name ? ' is-active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(s.panel === name) }, t(`calculator.panel.${name}`));
      b.addEventListener('click', () => ((s.panel = name), renderPanel()));
      return b;
    })
  );
  $('history-clear').dataset.tip = t(s.panel === 'memory' ? 'calculator.memory.clearAll' : 'calculator.clearHistory');
  historyList.replaceChildren();
  if (s.panel === 'memory') return renderMemoryList();
  if (!s.history.length) historyList.append(h('p', { class: 'history-empty' }, t('calculator.historyEmpty')));
  for (const entry of s.history) {
    const item = h('button', { class: 'history-item', type: 'button' }, h('small', null, entry.line), h('strong', null, entry.text ?? fmt(entry.result)));
    item.addEventListener('click', () => {
      historyEl.hidden = true;
      if (entry.mode === 'prog' && s.mode === 'prog') Object.assign(p, { cur: pg.wrap(entry.value, p.bits), fresh: true, acc: null, op: null, expr: '' });
      else if (entry.mode === 'sci' && s.mode === 'sci') (sciClear(), (sci.result = entry.result));
      else if (entry.mode === 'standard' && s.mode === 'standard') (clearAll(), (s.cur = String(Number(entry.result.toPrecision(15)))));
      render();
    });
    historyList.append(item);
  }
}

function renderMemoryList() {
  if (!s.memory.length) return historyList.append(h('p', { class: 'history-empty' }, t('calculator.memory.empty')));
  s.memory.forEach((value, index) => {
    const small = (label, tip, action) => {
      const b = h('button', { class: 'mem-btn', type: 'button', 'aria-label': tip, 'data-tip': tip }, label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        action();
        renderMemoryBar();
        renderPanel();
      });
      return b;
    };
    const row = h(
      'div',
      { class: 'mem-item' },
      h('strong', null, fmt(value)),
      h('div', { class: 'mem-actions' }, small('MC', t('calculator.memory.clear'), () => s.memory.splice(index, 1)), small('M+', t('calculator.memory.add'), () => (s.memory[index] = Number((value + (currentNumber() ?? 0)).toPrecision(15)))), small('M−', t('calculator.memory.subtract'), () => (s.memory[index] = Number((value - (currentNumber() ?? 0)).toPrecision(15)))))
    );
    row.addEventListener('click', () => {
      historyEl.hidden = true;
      if (s.mode === 'sci') sciAppend(String(value));
      else (clearAll(), (s.cur = String(value)));
      render();
    });
    historyList.append(row);
  });
}

$('history-btn').addEventListener('click', () => {
  historyEl.hidden = !historyEl.hidden;
  if (!historyEl.hidden) renderPanel();
});
$('history-clear').addEventListener('click', () => {
  if (s.panel === 'memory') s.memory = [];
  else s.history = [];
  renderMemoryBar();
  renderPanel();
});

/* ------------------------------------- modes ---------------------------------- */

function render() {
  renderMemoryBar();
  if (s.mode === 'sci') return renderSci();
  if (s.mode === 'prog') return renderProgrammer();
  if (s.mode === 'conv') return renderConverter();
  if (s.mode === 'date') return;
  valueEl.classList.toggle('is-error', !!s.error);
  valueEl.textContent = s.error ? t(s.error) : s.justTyped ? typed() : fmt(s.cur);
  exprEl.textContent = s.expr;
  valueEl.style.fontSize = s.error ? '' : fitFont(valueEl.textContent.length);
}

const modeName = () => (s.mode === 'conv' ? t(`calculator.categories.${conv.category}`) : t(`calculator.modes.${s.mode}`));

function setMode(mode, category) {
  s.mode = mode;
  if (category) conv.category = category;
  if (mode === 'conv') conv.fresh = true;
  calcEl.dataset.mode = mode;
  $('mode-title').textContent = modeName();
  displayEl.hidden = mode === 'conv' || mode === 'date';
  basesEl.hidden = mode !== 'prog';
  convEl.hidden = mode !== 'conv';
  dateEl.hidden = mode !== 'date';
  document.title = `${modeName()} - ${t('app.name')}`;
  buildKeys();
  if (mode === 'date') renderDate();
  render();
}

function navItems() {
  const radio = (label, active, action) => ({ label, checked: active, radio: true, action });
  return [
    { label: t('calculator.nav.calculator'), disabled: true },
    radio(t('calculator.modes.standard'), s.mode === 'standard', () => setMode('standard')),
    radio(t('calculator.modes.sci'), s.mode === 'sci', () => setMode('sci')),
    radio(t('calculator.modes.prog'), s.mode === 'prog', () => setMode('prog')),
    radio(t('calculator.modes.date'), s.mode === 'date', () => setMode('date')),
    { separator: true },
    { label: t('calculator.nav.converter'), disabled: true },
    ...CATEGORY_IDS.map((id) => radio(t(`calculator.categories.${id}`), s.mode === 'conv' && conv.category === id, () => setMode('conv', id)))
  ];
}

os.dropdown($('nav-btn'), navItems);

/* ----------------------------------- keyboard ---------------------------------- */

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  let run = null;
  const closePanel = () => (historyEl.hidden = true);
  if (s.mode === 'date') return;
  if (s.mode === 'sci') {
    if (/^\d$/.test(k) || '+-*/^!%()'.includes(k)) run = () => sciAppend(k);
    else if (k === '.' || k === ',') run = () => sciAppend('.');
    else if (k === 'Enter' || k === '=') run = sciEquals;
    else if (k === 'Backspace') run = sciBackspace;
    else if (k === 'Escape') run = historyEl.hidden ? sciClear : closePanel;
  } else if (s.mode === 'prog') {
    if (/^[0-9a-f]$/i.test(k)) run = () => pDigit(k);
    else if ('+-*/'.includes(k)) run = () => pOperator(k);
    else if (k === 'Enter' || k === '=') run = pEquals;
    else if (k === 'Backspace') run = pBackspace;
    else if (k === '&') run = () => pOperator('and');
    else if (k === '|') run = () => pOperator('or');
    else if (k === '^') run = () => pOperator('xor');
    else if (k === '~') run = () => pUnary('not');
    else if (k === '%') run = () => pOperator('mod');
    else if (k === 'Escape') run = historyEl.hidden ? pClear : closePanel;
  } else if (s.mode === 'conv') {
    if (/^\d$/.test(k)) run = () => convDigit(k);
    else if (k === '.' || k === ',') run = convDot;
    else if (k === 'Backspace') run = convBack;
    else if (k === 'Escape' || k === 'Delete') run = convClear;
  } else {
    if (/^\d$/.test(k)) run = () => digit(k);
    else if (k === '.' || k === ',') run = dot;
    else if ('+-*/'.includes(k)) run = () => operator(k);
    else if (k === 'Enter' || k === '=') run = equals;
    else if (k === 'Backspace') run = backspace;
    else if (k === 'Escape') run = historyEl.hidden ? clearAll : closePanel;
    else if (k === 'Delete') run = () => ((s.cur = '0'), (s.fresh = true), (s.justTyped = true));
    else if (k === '%') run = () => unary('percent');
    else if (k.toLowerCase() === 'r') run = () => unary('inv');
    else if (k === '@') run = () => unary('sqrt');
  }
  if (!run) return;
  e.preventDefault();
  press(run);
});

i18n.on('change', () => {
  $('nav-btn').dataset.tip = t('calculator.nav.open');
  setMode(s.mode);
  if (!historyEl.hidden) renderPanel();
});

hydrateIcons(document);
$('nav-btn').dataset.tip = t('calculator.nav.open');
$('nav-btn').setAttribute('aria-label', t('calculator.nav.open'));
setMode('standard');
