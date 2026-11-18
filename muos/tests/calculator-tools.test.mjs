import test from 'node:test';
import assert from 'node:assert/strict';
import { convert, CATEGORIES, unitsOf } from '../apps/calculator/convert.js';
import { applyOp, format, parseDigits, not, negate, groupBinary, isDigit, ProgrammerError } from '../apps/calculator/programmer.js';
import { difference, shift, parseDay, toDay } from '../apps/calculator/dates.js';

const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps * Math.max(1, Math.abs(expected)), `${actual} is not ${expected}`);

test('unit conversion', () => {
  near(convert('length', 'kilometer', 'meter', 2), 2000);
  near(convert('length', 'mile', 'kilometer', 1), 1.609344);
  near(convert('weight', 'pound', 'kilogram', 10), 4.5359237);
  near(convert('time', 'day', 'hour', 2), 48);
  near(convert('data', 'gibibyte', 'mebibyte', 1), 1024);
  near(convert('angle', 'radian', 'degree', Math.PI), 180);
  near(convert('speed', 'kilometerPerHour', 'meterPerSecond', 36), 10);
});

test('temperature has formulas, not factors', () => {
  near(convert('temperature', 'celsius', 'fahrenheit', 100), 212);
  near(convert('temperature', 'fahrenheit', 'celsius', -40), -40);
  near(convert('temperature', 'celsius', 'kelvin', 0), 273.15);
  near(convert('temperature', 'kelvin', 'celsius', 0), -273.15);
});

test('every unit converts to itself and back', () => {
  for (const category of Object.keys(CATEGORIES)) {
    const units = unitsOf(category);
    assert.ok(units.length >= 3, category);
    for (const unit of units) near(convert(category, unit, unit, 7.5), 7.5);
    const [a, b] = units;
    near(convert(category, b, a, convert(category, a, b, 12.25)), 12.25);
  }
  assert.throws(() => convert('length', 'meter', 'second', 1));
});

test('programmer: numbers wrap to the word size', () => {
  assert.equal(parseDigits('FF', 16, 8), -1n);
  assert.equal(parseDigits('7F', 16, 8), 127n);
  assert.equal(parseDigits('1010', 2, 16), 10n);
  assert.equal(parseDigits('17', 8, 16), 15n);
  assert.equal(parseDigits('', 10, 32), 0n);
  assert.equal(applyOp(127n, '+', 1n, 8), -128n);
  assert.equal(applyOp(200n, '*', 2n, 16), 400n);
});

test('programmer: display in the four bases', () => {
  assert.equal(format(255n, 16, 32), 'FF');
  assert.equal(format(-1n, 16, 8), 'FF');
  assert.equal(format(-1n, 10, 8), '-1');
  assert.equal(format(8n, 2, 8), '1000');
  assert.equal(format(8n, 8, 8), '10');
  assert.equal(groupBinary('11110000'), '1111 0000');
  assert.equal(groupBinary('101'), '101');
});

test('programmer: bitwise operations and shifts', () => {
  assert.equal(applyOp(0b1100n, 'and', 0b1010n, 8), 0b1000n);
  assert.equal(applyOp(0b1100n, 'or', 0b1010n, 8), 0b1110n);
  assert.equal(applyOp(0b1100n, 'xor', 0b1010n, 8), 0b0110n);
  assert.equal(not(0n, 8), -1n);
  assert.equal(applyOp(1n, 'lsh', 4n, 8), 16n);
  assert.equal(applyOp(-16n, 'rsh', 2n, 8), -4n);
  assert.equal(applyOp(1n, 'lsh', 7n, 8), -128n);
  assert.equal(negate(5n, 8), -5n);
  assert.equal(applyOp(7n, '/', 2n, 8), 3n);
  assert.equal(applyOp(-7n, '/', 2n, 8), -3n);
  assert.equal(applyOp(7n, 'mod', 4n, 8), 3n);
});

test('programmer: division by zero and digits of a base', () => {
  assert.throws(() => applyOp(1n, '/', 0n, 32), ProgrammerError);
  assert.throws(() => applyOp(1n, 'mod', 0n, 32), (err) => err.message === 'calculator.divZero');
  assert.ok(isDigit('F', 16));
  assert.ok(isDigit('7', 8));
  assert.ok(!isDigit('8', 8));
  assert.ok(!isDigit('2', 2));
  assert.ok(!isDigit('A', 10));
});

test('dates: the difference in years, months and days', () => {
  const diff = (a, b) => difference(parseDay(a), parseDay(b));
  assert.deepEqual(diff('2026-01-01', '2026-01-01'), { years: 0, months: 0, days: 0, total: 0 });
  assert.deepEqual(diff('2020-02-29', '2021-03-01'), { years: 1, months: 0, days: 1, total: 366 });
  assert.deepEqual(diff('2026-01-31', '2026-03-01'), { years: 0, months: 1, days: 1, total: 29 });
  assert.deepEqual(diff('2026-03-01', '2026-01-31'), { years: 0, months: 1, days: 1, total: 29 }); // order does not matter
  assert.equal(diff('2000-01-01', '2026-11-14').years, 26);
  assert.equal(diff('2026-12-31', '2027-01-01').total, 1);
});

test('dates: adding and subtracting', () => {
  const add = (day, delta, sign) => toDay(shift(parseDay(day), delta, sign));
  assert.equal(add('2026-01-31', { months: 1 }, 1), '2026-02-28');
  assert.equal(add('2024-01-31', { months: 1 }, 1), '2024-02-29');
  assert.equal(add('2026-11-14', { days: 30 }, 1), '2026-12-14');
  assert.equal(add('2026-11-14', { days: 365 }, -1), '2025-11-14');
  assert.equal(add('2026-03-15', { years: 1, months: 2, days: 3 }, 1), '2027-05-18');
  assert.equal(add('2026-01-15', { months: 2 }, -1), '2025-11-15');
  assert.equal(parseDay('nope'), null);
});
