import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const data = (await import(pathToFileURL(path.join(root, "data.js")).href)).default;
const { brand } = await import(pathToFileURL(path.join(root, "assets/data/data.js")).href);
const output = path.join(root, process.argv[2] || ".github/social-preview.png");

const fileUrl = (relative) => pathToFileURL(path.join(root, relative)).href;
const apps = data.projects.filter((project) => project.publisher === "{brand}" && project.id !== data.home).slice(0, 16);
const tagline = data.ui["splash.tagline"]["en-US"];
const name = brand.name;
const before = name.slice(0, name.indexOf(brand.highlight));

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
@font-face { font-family: "Inter"; font-weight: 400; src: url("${fileUrl("assets/fonts/inter-latin-400-normal.woff2")}") format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 700; src: url("${fileUrl("assets/fonts/inter-latin-700-normal.woff2")}") format("woff2"); }
html, body { width: 1280px; height: 640px; margin: 0; overflow: hidden; background: #1a1a1b; color: #dadedf; font-family: "Inter", system-ui, sans-serif; }
.card { position: absolute; inset: 80px; display: flex; align-items: center; justify-content: space-between; gap: 64px; }
.text { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
.title { display: flex; align-items: center; gap: 28px; font-size: 104px; font-weight: 700; line-height: 1; letter-spacing: -3px; }
.logo { flex: none; width: 112px; height: 112px; image-rendering: pixelated; }
.highlight { color: #1782db; }
.tagline { font-size: 44px; line-height: 1.2; color: #8d9091; }
.facts { display: flex; gap: 16px; align-items: center; font-size: 26px; }
.chip { padding: 6px 18px; border: 2px solid #373738; border-radius: 6px; font-weight: 700; }
.site { color: #8d9091; }
.grid { flex: none; display: grid; grid-template-columns: repeat(4, 64px); gap: 24px; }
.grid img { width: 64px; height: 64px; image-rendering: pixelated; }
</style>
</head>
<body>
<div class="card">
<div class="text">
<div class="title"><img class="logo" src="${fileUrl("favicon.png")}" alt=""><span>${before}<span class="highlight">${brand.highlight}</span></span></div>
<div class="tagline">${tagline}</div>
<div class="facts"><span class="chip">AGPL-3.0-or-later</span><span class="site">Open source</span></div>
</div>
<div class="grid">${apps.map((project) => `<img src="${fileUrl(project.icon)}" alt="">`).join("")}</div>
</div>
</body>
</html>`;

const work = fs.mkdtempSync(path.join(os.tmpdir(), "repo-card-"));
try {
  const html = path.join(work, "card.html");
  fs.writeFileSync(html, page);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await promisify(execFile)(chrome, [
    "--headless=new",
    "--disable-gpu",
    `--user-data-dir=${path.join(work, "profile")}`,
    "--allow-file-access-from-files",
    "--window-size=1280,640",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    `--screenshot=${output}`,
    pathToFileURL(html).href,
  ]);
  console.log(`${path.relative(root, output).replace(/\\/g, "/")}: ${(fs.statSync(output).size / 1024).toFixed(0)} KB`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
