import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "og-cards-"));
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const data = (await import(pathToFileURL(path.join(root, "data.js")).href)).default;
const only = process.argv[2];

const projects = data.projects.filter((project) => project.publisher === "{brand}" && (!only || project.id === only));
if (!projects.length) throw new Error(only ? `no app with the id ${only}` : "no apps");

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((request, response) => {
  const asked = path.join(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/\/$/, "/index.html"));
  if (!asked.startsWith(root) || !fs.existsSync(asked) || fs.statSync(asked).isDirectory()) return void response.writeHead(404).end();
  response.writeHead(200, { "Content-Type": types[path.extname(asked)] || "application/octet-stream" }).end(fs.readFileSync(asked));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  for (const project of projects) {
    const output = path.join(root, project.id === data.home ? "" : project.url.replace(/\/$/, ""), "preview.png");
    await promisify(execFile)(chrome, ["--headless=new", "--disable-gpu", `--user-data-dir=${path.join(work, "profile")}`, "--window-size=1200,630", "--hide-scrollbars", "--force-device-scale-factor=1", "--virtual-time-budget=5000", `--screenshot=${output}`, `http://127.0.0.1:${server.address().port}/assetmu/?preview=${project.id}`], { timeout: 60000 });
    console.log(`${path.relative(root, output).replace(/\\/g, "/")}: ${(fs.statSync(output).size / 1024).toFixed(0)} KB`);
  }
} finally {
  server.close();
  fs.rmSync(work, { recursive: true, force: true });
}
