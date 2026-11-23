// Makes what a search engine reads in the pages of Kancamu (RULES.md, HTML 10): sitemap.xml, robots.txt, and, in the index.html of the main website and of every app,
// the title, the canonical address, the structured data (JSON-LD), the preload of the image of the splash screen (main website), and a text for the visitors without JavaScript (<noscript>, with the link to the main website and, on the main website, to the apps).
// Everything comes from the main data.json (the name, the description, the categories), so it follows an app that changes or is added. It is safe to run again: its parts are between markers.
//   node assets/tools/seo.mjs
// It needs Node 20 or newer. The address of the website is in CNAME.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const site = `https://${read("CNAME").trim()}/`;
const data = JSON.parse(read("data.json"));
const brand = JSON.parse(read("assets/data/brand.json"));
const fill = (text) => text.replaceAll("{highlight}", brand.highlight).replaceAll("{brand}", brand.name);
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The apps of the brand only: the others (ArtCraft, TraceDraw) belong to their makers and are not changed here.
const own = data.projects.filter((project) => project.publisher === "{brand}");
const folderOf = (project) => (project.id === "kancamu" ? "" : project.url.replace(/^\.\/?|\/$/g, ""));
const addressOf = (project) => `${site}${folderOf(project)}${folderOf(project) ? "/" : ""}`;
const categoryOf = (project) => (project.categories.includes("design") ? "DesignApplication" : project.categories.includes("education") ? "EducationalApplication" : "UtilitiesApplication");

const organization = { "@type": "Organization", "@id": `${site}#brand`, name: brand.name, url: site, logo: `${site}favicon.png` };
const jsonLd = (project) => {
  const description = project.description["en-US"];
  if (project.id === "kancamu") {
    return { "@context": "https://schema.org", "@graph": [organization, { "@type": "WebSite", "@id": `${site}#website`, url: site, name: brand.name, description, publisher: { "@id": organization["@id"] } }] };
  }
  return {
    "@context": "https://schema.org", "@type": "WebApplication", name: fill(project.name["en-US"]), url: addressOf(project), description,
    applicationCategory: categoryOf(project), operatingSystem: "Any", browserRequirements: "Requires JavaScript", image: `${addressOf(project)}preview.png`,
    isPartOf: { "@id": `${site}#website` }, publisher: { "@type": "Organization", name: brand.name, url: site },
  };
};

const title = (project) => (project.id === "kancamu" ? `${brand.name} — ${project.description["en-US"]}` : `${fill(project.name["en-US"])} — ${project.description["en-US"]}`);

// What the visitors without JavaScript read (the page is made by scripts): the name, what it is, the way home, and, on the main website, the apps.
function noscript(project, indent) {
  const name = fill(project.name["en-US"]);
  const lines = [`<h1>${escape(project.id === "kancamu" ? brand.name : name)}</h1>`, `<p>${escape(project.description["en-US"])}</p>`];
  if (project.id === "kancamu") {
    lines.push("<ul>", ...own.filter((item) => item.id !== "kancamu").map((item) => `<li><a href="${folderOf(item)}/">${escape(fill(item.name["en-US"]))}</a>: ${escape(item.description["en-US"])}</li>`), "</ul>");
  } else {
    lines.push(`<p><a href="../">${escape(brand.name)}</a></p>`);
  }
  lines.push("<p>This page needs JavaScript.</p>");
  return `${indent}<noscript>\n${lines.map((line) => `${indent}  ${line.startsWith("<li>") ? "  " : ""}${line}`).join("\n")}\n${indent}</noscript>`;
}

for (const project of own) {
  const file = path.join(folderOf(project), "index.html");
  const crlf = read(file).includes("\r\n");
  let html = read(file).replace(/\r\n/g, "\n");
  html = html.replace(/[ \t]*<!-- seo -->[\s\S]*?<!-- \/seo -->\n/, "").replace(/[ \t]*<!-- seo-body -->[\s\S]*?<!-- \/seo-body -->\n/, "");
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escape(title(project))}</title>`);
  const twitter = /^([ \t]*)<meta name="twitter:card"[^\n]*\n/m.exec(html);
  if (!twitter) throw new Error(`${file}: no twitter:card tag`);
  const indent = twitter[1];
  const preload = project.id === "kancamu" ? `${indent}<link rel="preload" as="image" href="${data.splash.sprite?.file || data.splash.images[0].file}" fetchpriority="high">\n` : "";   // the image of the splash screen (the sprite of its images, or the first image): the largest element of the main website, whose address a script sets
  const head = `${indent}<!-- seo -->\n${indent}<link rel="canonical" href="${addressOf(project)}">\n${preload}${indent}<script type="application/ld+json">${JSON.stringify(jsonLd(project))}</script>\n${indent}<!-- /seo -->\n`;
  html = html.replace(twitter[0], () => twitter[0] + head);
  const body = /<body[^>]*>\n/.exec(html);
  if (!body) throw new Error(`${file}: no body tag`);
  html = html.replace(body[0], () => `${body[0]}${indent}<!-- seo-body -->\n${noscript(project, indent)}\n${indent}<!-- /seo-body -->\n`);
  fs.writeFileSync(path.join(root, file), crlf ? html.replace(/\n/g, "\r\n") : html);
}

fs.writeFileSync(path.join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${own.map((project) => `  <url><loc>${addressOf(project)}</loc></url>`).join("\n")}\n</urlset>\n`);
fs.writeFileSync(path.join(root, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${site}sitemap.xml\n`);
console.log(`${own.length} pages, sitemap.xml, robots.txt`);
