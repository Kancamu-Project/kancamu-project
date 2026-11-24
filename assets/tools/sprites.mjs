// Makes the sprites of the main website: one file with many images, so a page asks for one file and not for one for every image (RULES.md, Images).
//   assets/images/splash.webp   the images of the splash screen (data.js, "splash", "images"), the whole file is a square of 768 px (four images of 384 px in a grid of 2 x 2)
//   assets/images/icons.webp     the icons of all the apps of the directory (data.js, "projects"), in two blocks side by side: the pixel icons (16 px or less, as they are, in cells of 16 px)
//                               and the icons of other makers (ArtCraft, TraceDraw: made smaller, 48 px at most, smoothly, in cells of 48 px). Each block is a grid as square as it can be.
// The favicon.png of each app stays: it is the favicon of its app. The splash has no single files: its images are in the sprite, and their originals (<name>_raw) are the source.
// It also writes in data.js what app.js needs to cut the sprites ("splash.sprite" and "iconSprite"), so run it again when an image or an app is added.
//   node assets/tools/sprites.mjs            both
//   node assets/tools/sprites.mjs icons      only the icons
//   node assets/tools/sprites.mjs splash     only the splash (it needs the originals: assets/images/<name>_raw.png or .jpg, which are not kept in the repository)
// The pictures are made by Chrome (a page of this script, with a canvas), so it needs Node 20 or newer and Chrome (the variable CHROME has the address of chrome.exe
// when it is not at its usual place). Nothing is installed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readData } from "./data.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const only = process.argv[2];   // "icons" or "splash"
const SIZE = 768;               // the whole sprite of the splash is a square of this many pixels; a square of an image is SIZE divided by the columns of the grid
const PIXEL = 16;               // the cell of a pixel icon (an icon of 16 px or less is kept as it is)
const CELL = 48;                // the cell of the other icons: they are made smaller than this

const dataFile = path.join(root, "data.js");
const data = readData(dataFile);

// ---- what goes in the sprites
const wantSplash = only !== "icons";
const wantIcons = only !== "splash";
const images = data.splash.images;
const rawOf = (name) => fs.readdirSync(path.join(root, "assets/images")).find((entry) => entry.startsWith(`${name}_raw.`));
const raws = images.map((image) => rawOf(image.name));
if (wantSplash && raws.some((raw) => !raw)) {
  const missing = images.filter((_, index) => !raws[index]).map((image) => `assets/images/${image.name}_raw.png (or .jpg)`);
  throw new Error(`the originals of the splash images are needed: ${missing.join(", ")}`);
}
const icons = data.projects.filter((project) => project.icon).map((project) => ({ id: project.id, src: /^https?:/.test(project.icon) ? project.icon : `/${project.icon}`, remote: /^https?:/.test(project.icon) }));

const grid = (count) => Math.ceil(Math.sqrt(count));   // the columns of a grid for that many squares; the rows are as many as they need
const job = {
  splashColumns: grid(images.length),
  tile: SIZE / grid(images.length), pixel: PIXEL, cell: CELL,
  splash: wantSplash ? raws.map((raw) => `/assets/images/${raw}`) : [],
  icons: wantIcons ? icons : [],
};

// ---- the page that makes the pictures (it is served by this script and is not kept in the repository)
const page = `<!doctype html><meta charset="utf-8"><body><script type="module">
const job = await (await fetch("/__job.json")).json();
const load = async (source, remote) => { const image = new Image(); if (remote) image.crossOrigin = "anonymous"; image.src = source; await image.decode(); return image; };
// a square of the middle of the image, as the splash shows it (background: center / cover)
const cover = (context, image, x, y, size) => { const side = Math.min(image.naturalWidth, image.naturalHeight); context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, x, y, size, size); };
const save = async (name, canvas, type, quality) => {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  await fetch("/__save?name=" + encodeURIComponent(name), { method: "POST", body: blob });
};
const sheet = (width, height) => { const canvas = Object.assign(document.createElement("canvas"), { width, height }); const context = canvas.getContext("2d"); context.imageSmoothingQuality = "high"; return [canvas, context]; };
if (job.splash.length) {
  const columns = job.splashColumns, rows = Math.ceil(job.splash.length / columns);
  const [canvas, context] = sheet(job.tile * columns, job.tile * rows);
  for (const [index, source] of job.splash.entries()) cover(context, await load(source), (index % columns) * job.tile, Math.floor(index / columns) * job.tile, job.tile);
  await save("splash.webp", canvas, "image/webp", 0.85);
}
if (job.icons.length) {
  // the icons are loaded first (one that cannot be loaded is left out), then the grid is made for the ones that are there
  const loaded = [], skipped = [];
  for (const icon of job.icons) { try { loaded.push({ id: icon.id, image: await load(icon.src, icon.remote) }); } catch { skipped.push(icon.id); } }
  // two blocks side by side: the pixel icons as they are (cells of 16 px), and the others made smaller (cells of 48 px); each block is a grid as square as it can be
  const block = (list, side) => { const columns = Math.ceil(Math.sqrt(list.length)); return { list, side, columns, width: columns * side, height: Math.ceil(list.length / (columns || 1)) * side }; };
  const small = block(loaded.filter(({ image }) => Math.max(image.naturalWidth, image.naturalHeight) <= job.pixel), job.pixel);
  const large = block(loaded.filter(({ image }) => Math.max(image.naturalWidth, image.naturalHeight) > job.pixel), job.cell);
  const width = small.width + large.width, height = Math.max(small.height, large.height);
  const [canvas, context] = sheet(width, height);
  const cells = {};   // for each icon: [x, y, side] in the file
  for (const [group, left, smooth] of [[small, 0, false], [large, small.width, true]]) {
    context.imageSmoothingEnabled = smooth;   // a pixel icon is not smoothed; the others are made smaller, smoothly
    group.list.forEach(({ id, image }, index) => {
      const scale = Math.min(1, group.side / image.naturalWidth, group.side / image.naturalHeight);
      const w = Math.round(image.naturalWidth * scale), h = Math.round(image.naturalHeight * scale);
      const x = left + (index % group.columns) * group.side, y = Math.floor(index / group.columns) * group.side;
      context.drawImage(image, x + (group.side - w) / 2, y + (group.side - h) / 2, w, h);
      cells[id] = [x, y, group.side];
    });
  }
  await save("icons.webp", canvas, "image/webp", 1);   // quality 1: lossless, so the pixel icons stay exact
  await fetch("/__save?name=icons.json", { method: "POST", body: JSON.stringify({ width, height, cells, skipped }) });
}
await fetch("/__done", { method: "POST" });
</script>`;

// ---- a server for the page, the files, and the pictures that come back
const work = fs.mkdtempSync(path.join(os.tmpdir(), "sprites-"));
const types = { ".html": "text/html", ".json": "application/json", ".ico": "image/x-icon", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
let finish;
const done = new Promise((resolve) => { finish = resolve; });
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/__page.html") return void response.writeHead(200, { "Content-Type": "text/html" }).end(page);
  if (url.pathname === "/__job.json") return void response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(job));
  if (url.pathname === "/__save" && request.method === "POST") {
    const name = path.basename(url.searchParams.get("name") || "");
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => { fs.writeFileSync(path.join(work, name), Buffer.concat(chunks)); response.writeHead(204).end(); });
    return;
  }
  if (url.pathname === "/__done") { response.writeHead(204).end(); finish(); return; }
  const asked = path.join(root, decodeURIComponent(url.pathname));
  if (!asked.startsWith(root) || !fs.existsSync(asked) || fs.statSync(asked).isDirectory()) return void response.writeHead(404).end();
  response.writeHead(200, { "Content-Type": types[path.extname(asked).toLowerCase()] || "application/octet-stream" }).end(fs.readFileSync(asked));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

// Chrome is started with a profile of its own and stopped when the pictures are there (only the one that this script started)
const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${path.join(work, "profile")}`, `http://127.0.0.1:${server.address().port}/__page.html`], { stdio: "ignore" });
const stop = () => {
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGKILL");
  } catch { /* it has stopped already */ }
};
const timeout = setTimeout(() => { stop(); console.error("Chrome did not finish in 3 minutes."); process.exit(1); }, 180000);
await done;
clearTimeout(timeout);
stop();
server.close();

// ---- the files, and what data.js says about them
const put = (name, destination) => {
  const source = path.join(work, name);
  if (!fs.existsSync(source)) throw new Error(`${name} was not made`);
  fs.copyFileSync(source, path.join(root, destination));
  console.log(`${destination}: ${(fs.statSync(path.join(root, destination)).size / 1024).toFixed(0)} KB`);
};
if (wantSplash) {
  put("splash.webp", "assets/images/splash.webp");
  data.splash.sprite = { file: "assets/images/splash.webp", count: images.length, columns: grid(images.length) };
}
if (wantIcons) {
  put("icons.webp", "assets/images/icons.webp");
  const made = JSON.parse(fs.readFileSync(path.join(work, "icons.json"), "utf8"));
  if (made.skipped.length) console.warn(`left out (they could not be loaded): ${made.skipped.join(", ")}`);
  data.iconSprite = { file: "assets/images/icons.webp", width: made.width, height: made.height, cells: made.cells };
}
const out = `export default ${JSON.stringify(data, null, 2)};\n`;
fs.writeFileSync(dataFile, out);
try { fs.rmSync(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch { /* Chrome still holds its profile for a moment: the folder is in the temporary folder of the system */ }
console.log("data.js: splash.sprite and iconSprite are set");
