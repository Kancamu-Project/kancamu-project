/**
 * Expression evaluator of the scientific calculator. Pure (no DOM), so it can
 * be tested on its own.
 *
 *   evaluate('2+3*4')               -> 14
 *   evaluate('sin(30)')             -> 0.5   (degrees by default)
 *   evaluate('2^3!')                -> 64
 *
 * Operators: + - * / mod ^ ! %   Functions: sin cos tan ln log √ abs
 * Constants: π e      Implicit multiplication: 2π, 3(4+1), (2)(3)
 * Errors throw a CalcError whose message is a translation key
 * ('calculator.invalid' or 'calculator.divZero').
 */
export class CalcError extends Error {}

const INVALID = 'calculator.invalid';
const DIV_ZERO = 'calculator.divZero';
const fail = (key = INVALID) => {
  throw new CalcError(key);
};

const TOKEN = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|(π|e)(?![a-z])|(sin|cos|tan|ln|log|√|abs)\(|(mod)|([+\-*/^()!%]))/iy;

function tokenize(source) {
  const tokens = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < source.trimEnd().length) {
    const start = TOKEN.lastIndex;
    const m = TOKEN.exec(source);
    if (!m || m.index !== start) fail();
    if (m[1] !== undefined) tokens.push({ n: parseFloat(m[1]) });
    else if (m[2]) tokens.push({ n: m[2] === 'π' ? Math.PI : Math.E });
    else if (m[3]) tokens.push({ f: m[3].toLowerCase() });
    else if (m[4]) tokens.push({ op: 'mod' });
    else tokens.push({ op: m[5] });
  }
  return tokens;
}

function factorial(x) {
  if (!Number.isInteger(x) || x < 0 || x > 170) fail();
  let r = 1;
  for (let i = 2; i <= x; i++) r *= i;
  return r;
}

/** Round away the noise of floating point (sin(180°) = 1.2e-16) */
const tidy = (x) => (Math.abs(x) < 1e-12 ? 0 : Number(x.toPrecision(14)));

export function evaluate(source, { degrees = true } = {}) {
  const tokens = tokenize(String(source));
  if (!tokens.length) fail();
  let i = 0;
  const isOp = (op) => tokens[i]?.op === op;
  const startsOperand = () => {
    const tok = tokens[i];
    return !!tok && (tok.n !== undefined || !!tok.f || tok.op === '(');
  };

  const apply = (name, x) => {
    const rad = degrees ? (x * Math.PI) / 180 : x;
    switch (name) {
      case 'sin':
        return tidy(Math.sin(rad));
      case 'cos':
        return tidy(Math.cos(rad));
      case 'tan':
        if (Math.abs(Math.cos(rad)) < 1e-12) fail();
        return tidy(Math.tan(rad));
      case 'ln':
        if (x <= 0) fail();
        return Math.log(x);
      case 'log':
        if (x <= 0) fail();
        return tidy(Math.log10(x));
      case '√':
        if (x < 0) fail();
        return Math.sqrt(x);
      default:
        return Math.abs(x);
    }
  };

  function expression() {
    let value = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[i++].op;
      const right = term();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  function term() {
    let value = unary();
    for (;;) {
      if (isOp('*') || isOp('/') || isOp('mod')) {
        const op = tokens[i++].op;
        const right = unary();
        if (op === '*') value *= right;
        else if (right === 0) fail(DIV_ZERO);
        else value = op === '/' ? value / right : value % right;
      } else if (startsOperand()) {
        value *= unary(); // 2π, 3(4+1)
      } else {
        return value;
      }
    }
  }

  function unary() {
    if (isOp('-')) {
      i++;
      return -unary();
    }
    if (isOp('+')) {
      i++;
      return unary();
    }
    return power();
  }

  function power() {
    const base = postfix();
    if (!isOp('^')) return base;
    i++;
    return Math.pow(base, unary()); // right-associative: 2^3^2 = 2^9
  }

  function postfix() {
    let value = primary();
    while (isOp('!') || isOp('%')) value = tokens[i++].op === '!' ? factorial(value) : value / 100;
    return value;
  }

  function primary() {
    const tok = tokens[i++];
    if (!tok) fail();
    if (tok.n !== undefined) return tok.n;
    if (tok.op === '(' || tok.f) {
      const inner = expression();
      if (!isOp(')')) fail();
      i++;
      return tok.f ? apply(tok.f, inner) : inner;
    }
    return fail();
  }

  const result = expression();
  if (i !== tokens.length) fail();
  if (!Number.isFinite(result)) fail();
  return tidy(result);
}
