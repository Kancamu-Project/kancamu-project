/**
 * Unit converter data. Every category lists its units with the factor that
 * turns one of that unit into the category's base unit (temperature is the
 * exception, it has formulas).
 */
export const CATEGORIES = {
  length: {
    nanometer: 1e-9,
    micrometer: 1e-6,
    millimeter: 1e-3,
    centimeter: 1e-2,
    meter: 1,
    kilometer: 1e3,
    inch: 0.0254,
    foot: 0.3048,
    yard: 0.9144,
    mile: 1609.344,
    nauticalMile: 1852
  },
  weight: { milligram: 1e-6, gram: 1e-3, kilogram: 1, tonne: 1000, ounce: 0.028349523125, pound: 0.45359237, stone: 6.35029318 },
  temperature: { celsius: null, fahrenheit: null, kelvin: null },
  volume: {
    milliliter: 1e-3,
    liter: 1,
    cubicMeter: 1000,
    teaspoon: 0.00492892159375,
    tablespoon: 0.01478676478125,
    fluidOunce: 0.0295735295625,
    cup: 0.2365882365,
    pint: 0.473176473,
    quart: 0.946352946,
    gallon: 3.785411784
  },
  area: {
    squareCentimeter: 1e-4,
    squareInch: 0.00064516,
    squareFoot: 0.09290304,
    squareYard: 0.83612736,
    squareMeter: 1,
    hectare: 1e4,
    acre: 4046.8564224,
    squareKilometer: 1e6,
    squareMile: 2589988.110336
  },
  speed: { meterPerSecond: 1, kilometerPerHour: 1 / 3.6, milePerHour: 0.44704, knot: 1852 / 3600, footPerSecond: 0.3048 },
  time: { millisecond: 1e-3, second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, year: 31536000 },
  energy: { joule: 1, kilojoule: 1e3, calorie: 4.184, kilocalorie: 4184, wattHour: 3600, kilowattHour: 3.6e6, electronVolt: 1.602176634e-19, btu: 1055.056, footPound: 1.3558179483314 },
  power: { watt: 1, kilowatt: 1e3, megawatt: 1e6, horsepower: 745.69987158227 },
  data: { bit: 1, byte: 8, kilobyte: 8e3, megabyte: 8e6, gigabyte: 8e9, terabyte: 8e12, kibibyte: 8 * 1024, mebibyte: 8 * 1024 ** 2, gibibyte: 8 * 1024 ** 3 },
  pressure: { pascal: 1, kilopascal: 1e3, bar: 1e5, atmosphere: 101325, psi: 6894.757293168, mmHg: 133.322387415 },
  angle: { degree: 1, radian: 180 / Math.PI, gradian: 0.9 }
};

/** Names of the converters, in the order of the menu. */
export const CATEGORY_IDS = Object.keys(CATEGORIES);

export const unitsOf = (category) => Object.keys(CATEGORIES[category]);

const TO_KELVIN = { celsius: (c) => c + 273.15, fahrenheit: (f) => ((f - 32) * 5) / 9 + 273.15, kelvin: (k) => k };
const FROM_KELVIN = { celsius: (k) => k - 273.15, fahrenheit: (k) => ((k - 273.15) * 9) / 5 + 32, kelvin: (k) => k };

/** Convert a value between two units of a category. */
export function convert(category, from, to, value) {
  const table = CATEGORIES[category];
  if (!table || !(from in table) || !(to in table)) throw new Error(`unknown unit ${category}:${from}:${to}`);
  if (category === 'temperature') return FROM_KELVIN[to](TO_KELVIN[from](value));
  return (value * table[from]) / table[to];
}
