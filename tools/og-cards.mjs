// Makes the preview image of every app of Kancamu (<app>/preview.png, 1200x630): the icon, the name, and the description of the app, in its colour.
// They are the images that the Open Graph tags of the apps point to (RULES.md, HTML 9). Run it again when the name, the description, the icon, or the colour of an app changes
// (they come from the app in data.json), and raise the number of "?v=" in the og:image of the app, so the sites that keep the old image in their cache ask for the new one.
//   node tools/og-cards.mjs            every app
//   node tools/og-cards.mjs hashmu     one app
// It needs Node 20 or newer and Chrome (the address of chrome.exe is in the variable CHROME when it is not at its usual place).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "og-cards-"));
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const data = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const brand = JSON.parse(fs.readFileSync(path.join(root, "assets/data/brand.json"), "utf8"));
const only = process.argv[2];   // one app, by its id

const fill = (text) => text.replaceAll("{highlight}", brand.highlight).replaceAll("{brand}", brand.name);
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fileUrl = (relative) => "file:///" + path.join(root, relative).replace(/\\/g, "/");

// The palette of assets/css/style.css (--black, --white, and the two grays that are mixes of them)
const palette = { black: "#1a1a1b", white: "#dadedf", neutral: "#8d9091", line: "#373839" };

const apps = data.projects.filter((project) => project.publisher === "{brand}" && project.id !== "kancamu" && (!only || project.id === only));
if (!apps.length) throw new Error(only ? `no app with the id ${only}` : "no apps");

for (const app of apps) {
  const folder = app.url.replace(/\/$/, "");
  const name = fill(app.name["en-US"]);
  const highlight = fill(app.highlight["en-US"]);
  const at = name.indexOf(highlight);
  const nameHtml = at < 0 ? escape(name) : `${escape(name.slice(0, at))}<span class="highlight">${escape(highlight)}</span>${escape(name.slice(at + highlight.length))}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Inter"; font-weight: 400; src: url("${fileUrl("assets/fonts/inter-latin-400-normal.woff2")}") format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 700; src: url("${fileUrl("assets/fonts/inter-latin-700-normal.woff2")}") format("woff2"); }
html, body { margin: 0; width: 1200px; height: 630px; background: ${palette.black}; color: ${palette.white}; font-family: "Inter", sans-serif; overflow: hidden; }
.card { position: relative; width: 1200px; height: 630px; box-sizing: border-box; display: flex; align-items: center; gap: 72px; padding: 0 96px 46px; }
.card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 10px; background: ${app.color}; }
.icon { flex: none; width: 280px; height: 280px; background: url("${fileUrl(app.icon)}") center / contain no-repeat; image-rendering: pixelated; }
.text { min-width: 0; display: flex; flex-direction: column; gap: 22px; }
.name { font-size: 132px; font-weight: 700; line-height: 1; letter-spacing: -2px; }
.highlight { color: ${app.color}; }
.description { font-size: 38px; line-height: 1.35; color: ${palette.neutral}; max-width: 640px; }
.footer { position: absolute; left: 0; right: 0; bottom: 0; height: 66px; display: flex; align-items: center; justify-content: space-between; padding: 0 96px; border-top: 2px solid ${palette.line}; font-size: 26px; color: ${palette.neutral}; }
</style></head><body><div class="card"><div class="icon"></div><div class="text"><div class="name">${nameHtml}</div><div class="description">${escape(app.description["en-US"])}</div></div><div class="footer"><span>© ${escape(brand.name)}</span><span>kancamu.site/${folder}/</span></div></div></body></html>`;
  const page = path.join(work, `${app.id}.html`);
  fs.writeFileSync(page, html);
  const output = path.join(root, folder, "preview.png");
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--allow-file-access-from-files", `--user-data-dir=${path.join(work, "profile")}`, "--window-size=1200,630", "--hide-scrollbars", "--force-device-scale-factor=1", "--virtual-time-budget=4000", `--screenshot=${output}`, "file:///" + page.replace(/\\/g, "/")], { stdio: "ignore" });
  console.log(`${folder}/preview.png: ${(fs.statSync(output).size / 1024).toFixed(0)} KB`);
}
fs.rmSync(work, { recursive: true, force: true });
