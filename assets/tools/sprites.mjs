// Makes the sprites of the main website: one file with many images, so a page asks for one file and not for one for every image (RULES.md, Images).
//   assets/images/splash.webp   the images of the splash screen (data.json, "splash", "images"), the whole file is a square of 512 px (four images of 256 px in a grid of 2 x 2)
//   assets/images/icons.png     the icons of the apps of the brand (16 x 16 px each), in a grid like that (4 x 4 for sixteen)
// The single files stay: the favicon.png of each app is its favicon, and the single image of the splash is used by the previews (assetmu).
// It also writes in data.json what app.js needs to cut the sprites ("splash.sprite" and "iconSprite"), so run it again when an image or an app is added.
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

const root = fileURLToPath(new URL("../..", import.meta.url));
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const only = process.argv[2];   // "icons" or "splash"
const SIZE = 512;               // the whole sprite of the splash is a square of this many pixels; a square of an image is SIZE divided by the columns of the grid
const SINGLE = 512;             // the single image of the splash, when it does not exist yet
const CELL = 16;                // an icon

const dataFile = path.join(root, "data.json");
const rawData = fs.readFileSync(dataFile, "utf8");
const data = JSON.parse(rawData);

// ---- what goes in the sprites
const wantSplash = only !== "icons";
const wantIcons = only !== "splash";
const images = data.splash.images;
const nameOf = (file) => path.basename(file).replace(/\.[^.]+$/, "");
const rawOf = (file) => fs.readdirSync(path.join(root, "assets/images")).find((entry) => entry.startsWith(`${nameOf(file)}_raw.`));
const raws = images.map((image) => rawOf(image.file));
if (wantSplash && raws.some((raw) => !raw)) {
  const missing = images.filter((_, index) => !raws[index]).map((image) => `assets/images/${nameOf(image.file)}_raw.png (or .jpg)`);
  throw new Error(`the originals of the splash images are needed: ${missing.join(", ")}`);
}
const own = data.projects.filter((project) => project.publisher === "{brand}" && !/^https?:/.test(project.icon) && /\.png$/.test(project.icon));
const pngSize = (file) => { const bytes = fs.readFileSync(path.join(root, file)); return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]; };
for (const project of own) {
  const [width, height] = pngSize(project.icon);
  if (width !== CELL || height !== CELL) throw new Error(`${project.icon} is ${width} x ${height}: an icon of the sprite is ${CELL} x ${CELL}`);
}

const grid = (count) => Math.ceil(Math.sqrt(count));   // the columns of a grid for that many squares; the rows are as many as they need
const job = {
  splashColumns: grid(images.length), iconColumns: grid(own.length),
  tile: SIZE / grid(images.length), single: SINGLE, cell: CELL,
  splash: wantSplash ? raws.map((raw) => `/assets/images/${raw}`) : [],
  singles: wantSplash ? images.map((image, index) => ({ out: path.basename(image.file), raw: `/assets/images/${raws[index]}`, exists: fs.existsSync(path.join(root, image.file)) })) : [],
  icons: wantIcons ? own.map((project) => `/${project.icon}`) : [],
};

// ---- the page that makes the pictures (it is served by this script and is not kept in the repository)
const page = `<!doctype html><meta charset="utf-8"><body><script type="module">
const job = await (await fetch("/__job.json")).json();
const load = async (source) => { const image = new Image(); image.src = source; await image.decode(); return image; };
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
  for (const single of job.singles) {
    if (single.exists) continue;
    const [small, smallContext] = sheet(job.single, job.single);
    cover(smallContext, await load(single.raw), 0, 0, job.single);
    await save(single.out, small, "image/webp", 0.8);
  }
}
if (job.icons.length) {
  const columns = job.iconColumns, rows = Math.ceil(job.icons.length / columns);
  const [canvas, context] = sheet(job.cell * columns, job.cell * rows);
  context.imageSmoothingEnabled = false;
  for (const [index, source] of job.icons.entries()) context.drawImage(await load(source), (index % columns) * job.cell, Math.floor(index / columns) * job.cell);
  await save("icons.png", canvas, "image/png");
}
await fetch("/__done", { method: "POST" });
</script>`;

// ---- a server for the page, the files, and the pictures that come back
const work = fs.mkdtempSync(path.join(os.tmpdir(), "sprites-"));
const types = { ".html": "text/html", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
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

// ---- the files, and what data.json says about them
const put = (name, destination) => {
  const source = path.join(work, name);
  if (!fs.existsSync(source)) throw new Error(`${name} was not made`);
  fs.copyFileSync(source, path.join(root, destination));
  console.log(`${destination}: ${(fs.statSync(path.join(root, destination)).size / 1024).toFixed(0)} KB`);
};
if (wantSplash) {
  put("splash.webp", "assets/images/splash.webp");
  for (const single of job.singles) if (!single.exists) put(single.out, `assets/images/${single.out}`);
  data.splash.sprite = { file: "assets/images/splash.webp", count: images.length, columns: grid(images.length) };
}
if (wantIcons) {
  put("icons.png", "assets/images/icons.png");
  data.iconSprite = { file: "assets/images/icons.png", columns: grid(own.length), ids: own.map((project) => project.id) };
}
const out = JSON.stringify(data, null, 2) + "\n";
fs.writeFileSync(dataFile, rawData.includes("\r\n") ? out.replace(/\n/g, "\r\n") : out);
try { fs.rmSync(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch { /* Chrome still holds its profile for a moment: the folder is in the temporary folder of the system */ }
console.log("data.json: splash.sprite and iconSprite are set");
