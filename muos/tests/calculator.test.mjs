import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, CalcError } from '../apps/calculator/scientific.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('arithmetic and precedence', () => {
  near(evaluate('2+3*4'), 14);
  near(evaluate('(2+3)*4'), 20);
  near(evaluate('10/4'), 2.5);
  near(evaluate('0.1+0.2'), 0.3);
  near(evaluate('10 mod 3'), 1);
  near(evaluate('-2^2'), -4);
  near(evaluate('2^3^2'), 512); // right-associative
  near(evaluate('2^-1'), 0.5);
});

test('postfix operators, constants and implicit multiplication', () => {
  near(evaluate('5!'), 120);
  near(evaluate('0!'), 1);
  near(evaluate('50%'), 0.5);
  near(evaluate('2π'), 2 * Math.PI);
  near(evaluate('3(4+1)'), 15);
  near(evaluate('(1+2)(3+4)'), 21);
  near(evaluate('e^1'), Math.E);
});

test('functions, in degrees or radians', () => {
  near(evaluate('sin(30)'), 0.5);
  near(evaluate('cos(60)'), 0.5);
  near(evaluate('sin(180)'), 0);
  near(evaluate('tan(45)'), 1);
  near(evaluate('sin(π/2)', { degrees: false }), 1);
  near(evaluate('ln(e)'), 1);
  near(evaluate('log(1000)'), 3);
  near(evaluate('√(16)'), 4);
  near(evaluate('abs(-5)'), 5);
});

test('errors are CalcErrors with a translation key', () => {
  const key = (source) => {
    try {
      evaluate(source);
    } catch (err) {
      assert.ok(err instanceof CalcError, source);
      return err.message;
    }
    return assert.fail(`${source} should fail`);
  };
  assert.equal(key('1/0'), 'calculator.divZero');
  assert.equal(key('5 mod 0'), 'calculator.divZero');
  for (const bad of ['', '2+', '(1', '1)', 'sin(', 'abc', 'tan(90)', 'ln(0)', '√(-1)', '2.5!', '(-1)!', '171!', '5 5 mod', '1+*2']) {
    assert.equal(key(bad), 'calculator.invalid', bad);
  }
});
