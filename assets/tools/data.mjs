// Reads a data file of the apps (data.js, brand.js, ...). They are ES modules with one default export, which the browser loads with import().
// A tool reads it as data, so it also works on Node 20, which does not load an ES module .js without a package.json that says "type": "module".
import fs from "node:fs";

export function readData(file) {
  const source = fs.readFileSync(file, "utf8").replace(/^\s*export\s+default\s+/, "").replace(/;\s*$/, "");
  return JSON.parse(source);
}
