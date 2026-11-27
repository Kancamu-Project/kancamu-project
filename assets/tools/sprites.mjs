import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const only = process.argv[2];
const SIZE = 768;
const PIXEL = 16;
const CELL = 48;

const dataFile = path.join(root, "data.js");
const rawData = fs.readFileSync(dataFile, "utf8");
const data = JSON.parse(rawData.replace(/^export default /, "").replace(/;\s*$/, ""));

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

const grid = (count) => Math.ceil(Math.sqrt(count));
const job = {
  splashColumns: grid(images.length),
  tile: SIZE / grid(images.length), pixel: PIXEL, cell: CELL,
  splash: wantSplash ? raws.map((raw) => `/assets/images/${raw}`) : [],
  icons: wantIcons ? icons : [],
};

const page = `<!doctype html><meta charset="utf-8"><body><script type="module">
const job = await (await fetch("/__job.json")).json();
const load = async (source, remote) => { const image = new Image(); if (remote) image.crossOrigin = "anonymous"; image.src = source; await image.decode(); return image; };
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
  await save("splash.webp", canvas, "image/webp", 0.75);
}
if (job.icons.length) {
  const loaded = [], skipped = [];
  for (const icon of job.icons) { try { loaded.push({ id: icon.id, image: await load(icon.src, icon.remote) }); } catch { skipped.push(icon.id); } }
  const block = (list, side) => { const columns = Math.ceil(Math.sqrt(list.length)); return { list, side, columns, width: columns * side, height: Math.ceil(list.length / (columns || 1)) * side }; };
  const small = block(loaded.filter(({ image }) => Math.max(image.naturalWidth, image.naturalHeight) <= job.pixel), job.pixel);
  const large = block(loaded.filter(({ image }) => Math.max(image.naturalWidth, image.naturalHeight) > job.pixel), job.cell);
  const width = small.width + large.width, height = Math.max(small.height, large.height);
  const [canvas, context] = sheet(width, height);
  const cells = {};
  for (const [group, left, smooth] of [[small, 0, false], [large, small.width, true]]) {
    context.imageSmoothingEnabled = smooth;
    group.list.forEach(({ id, image }, index) => {
      const scale = Math.min(1, group.side / image.naturalWidth, group.side / image.naturalHeight);
      const w = Math.round(image.naturalWidth * scale), h = Math.round(image.naturalHeight * scale);
      const x = left + (index % group.columns) * group.side, y = Math.floor(index / group.columns) * group.side;
      context.drawImage(image, x + (group.side - w) / 2, y + (group.side - h) / 2, w, h);
      cells[id] = [x, y, group.side];
    });
  }
  await save("icons.webp", canvas, "image/webp", 1);
  await fetch("/__save?name=icons.json", { method: "POST", body: JSON.stringify({ width, height, cells, skipped }) });
}
await fetch("/__done", { method: "POST" });
</script>`;

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

const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${path.join(work, "profile")}`, `http://127.0.0.1:${server.address().port}/__page.html`], { stdio: "ignore" });
const stop = () => {
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGKILL");
  } catch { }
};
const timeout = setTimeout(() => { stop(); console.error("Chrome did not finish in 3 minutes."); process.exit(1); }, 180000);
await done;
clearTimeout(timeout);
stop();
server.close();

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
fs.writeFileSync(dataFile, rawData.includes("\r\n") ? out.replace(/\n/g, "\r\n") : out);
try { fs.rmSync(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch { }
console.log("data.js: splash.sprite and iconSprite are set");
