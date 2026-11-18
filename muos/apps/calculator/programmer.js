/**
 * Integer arithmetic of the Programmer calculator: signed numbers of a fixed
 * word size (BigInt), shown in hexadecimal, decimal, octal and binary.
 */
export const WORD_SIZES = [64, 32, 16, 8];
export const BASES = { hex: 16, dec: 10, oct: 8, bin: 2 };

export const wrap = (n, bits) => BigInt.asIntN(bits, n);

const PREFIX = { 16: '0x', 8: '0o', 2: '0b', 10: '' };

/** The digits typed so far -> a number of the word size (too many digits wrap around). */
export function parseDigits(text, base, bits) {
  const digits = String(text).replace(/\s+/g, '');
  if (!digits) return 0n;
  return wrap(BigInt(`${PREFIX[base]}${digits}`), bits);
}

/** Negative numbers show as two's complement in every base but decimal. */
export function format(n, base, bits) {
  if (base === 10) return n.toString();
  return BigInt.asUintN(bits, n).toString(base).toUpperCase();
}

/** Binary in groups of four digits, easier to read. */
export function groupBinary(text) {
  return text.replace(/\B(?=(.{4})+$)/g, ' ');
}

export class ProgrammerError extends Error {}

/** `a op b`, wrapped to the word size. */
export function applyOp(a, op, b, bits) {
  switch (op) {
    case '+':
      return wrap(a + b, bits);
    case '-':
      return wrap(a - b, bits);
    case '*':
      return wrap(a * b, bits);
    case '/':
      if (b === 0n) throw new ProgrammerError('calculator.divZero');
      return wrap(a / b, bits); // BigInt division truncates towards zero
    case 'mod':
      if (b === 0n) throw new ProgrammerError('calculator.divZero');
      return wrap(a % b, bits);
    case 'and':
      return wrap(a & b, bits);
    case 'or':
      return wrap(a | b, bits);
    case 'xor':
      return wrap(a ^ b, bits);
    case 'nand':
      return wrap(~(a & b), bits);
    case 'nor':
      return wrap(~(a | b), bits);
    case 'lsh':
      return wrap(a << BigInt(Math.min(Math.max(Number(b), 0), bits)), bits);
    case 'rsh':
      return wrap(a >> BigInt(Math.min(Math.max(Number(b), 0), bits)), bits);
    default:
      return b;
  }
}

export const not = (a, bits) => wrap(~a, bits);
export const negate = (a, bits) => wrap(-a, bits);

/** True when a character is a digit of the base. */
export function isDigit(char, base) {
  const value = Number.parseInt(char, 16);
  return /^[0-9a-f]$/i.test(char) && value < base;
}
