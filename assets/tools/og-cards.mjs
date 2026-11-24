// Makes the preview image of the main website and of every app of Kancamu (preview.png, 1200x630): the images that the Open Graph tags point to (RULES.md, HTML 9).
// The images are not drawn here. Their source is the cards of the section Previews of Assetmu (in assetmu/app.js, shown alone with assetmu/?preview=<app>): this script
// opens each card in Chrome, in a window of 1200 x 630, and takes its picture. (The button "Save as image" of Assetmu makes the same image from the same card.)
// Run it again when the name, the description, the icon, or the colour of an app changes, or the first image of the splash screen, and raise the number of "?v=" in the og:image
// of the app, so the sites that keep the old image in their cache ask for the new one.
//   node assets/tools/og-cards.mjs            the main website and every app
//   node assets/tools/og-cards.mjs hashmu     one of them, by its id (kancamu is the main website)
// It needs Node 20 or newer and Chrome (the address of chrome.exe is in the variable CHROME when it is not at its usual place).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { readData } from "./data.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "og-cards-"));
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const data = readData(path.join(root, "data.js"));
const only = process.argv[2];   // one project, by its id

const projects = data.projects.filter((project) => project.publisher === "{brand}" && (!only || project.id === only));
if (!projects.length) throw new Error(only ? `no app with the id ${only}` : "no apps");

// The site is served from this folder for the time of the pictures (a page of a module does not run from a file).
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((request, response) => {
  const asked = path.join(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/\/$/, "/index.html"));
  if (!asked.startsWith(root) || !fs.existsSync(asked) || fs.statSync(asked).isDirectory()) return void response.writeHead(404).end();
  response.writeHead(200, { "Content-Type": types[path.extname(asked)] || "application/octet-stream" }).end(fs.readFileSync(asked));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  for (const project of projects) {
    const output = path.join(root, project.id === "kancamu" ? "" : project.url.replace(/\/$/, ""), "preview.png");
    // not execFileSync: it would stop this script, and with it the server that Chrome asks for the page
    await promisify(execFile)(chrome, ["--headless=new", "--disable-gpu", `--user-data-dir=${path.join(work, "profile")}`, "--window-size=1200,630", "--hide-scrollbars", "--force-device-scale-factor=1", "--virtual-time-budget=5000", `--screenshot=${output}`, `http://127.0.0.1:${server.address().port}/assetmu/?preview=${project.id}`], { timeout: 60000 });
    console.log(`${path.relative(root, output).replace(/\\/g, "/")}: ${(fs.statSync(output).size / 1024).toFixed(0)} KB`);
  }
} finally {
  server.close();
  fs.rmSync(work, { recursive: true, force: true });
}
