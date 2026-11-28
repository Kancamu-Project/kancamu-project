import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const site = `https://${read("CNAME").trim()}/`;
const data = (await import(pathToFileURL(path.join(root, "data.js")).href)).default;
const { brand } = await import(pathToFileURL(path.join(root, "assets/data/data.js")).href);
const fill = (text) => text.replaceAll("{highlight}", brand.highlight).replaceAll("{brand}", brand.name);
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const own = data.projects.filter((project) => project.publisher === "{brand}");
const folderOf = (project) => (project.id === data.home ? "" : project.url.replace(/^\.\/?|\/$/g, ""));
const addressOf = (project) => `${site}${folderOf(project)}${folderOf(project) ? "/" : ""}`;
const categoryOf = (project) => (project.categories.includes("design") ? "DesignApplication" : project.categories.includes("education") ? "EducationalApplication" : project.categories.includes("social") ? "SocialNetworkingApplication" : "UtilitiesApplication");

const organization = { "@type": "Organization", "@id": `${site}#brand`, name: brand.name, url: site, logo: `${site}favicon.png` };
const jsonLd = (project) => {
  const description = project.description["en-US"];
  if (project.id === data.home) {
    return { "@context": "https://schema.org", "@graph": [organization, { "@type": "WebSite", "@id": `${site}#website`, url: site, name: brand.name, description, publisher: { "@id": organization["@id"] } }] };
  }
  return {
    "@context": "https://schema.org", "@type": "WebApplication", name: fill(project.name["en-US"]), url: addressOf(project), description,
    applicationCategory: categoryOf(project), operatingSystem: "Any", browserRequirements: "Requires JavaScript", image: `${addressOf(project)}preview.png`,
    isPartOf: { "@id": `${site}#website` }, publisher: { "@type": "Organization", name: brand.name, url: site },
  };
};

const title = (project) => (project.id === data.home ? `${brand.name} — ${project.description["en-US"]}` : `${fill(project.name["en-US"])} — ${project.description["en-US"]}`);

function noscript(project, indent) {
  const name = fill(project.name["en-US"]);
  const lines = [`<h1>${escape(project.id === data.home ? brand.name : name)}</h1>`, `<p>${escape(project.description["en-US"])}</p>`];
  if (project.id === data.home) {
    lines.push("<ul>", ...own.filter((item) => item.id !== data.home).map((item) => `<li><a href="${folderOf(item)}/">${escape(fill(item.name["en-US"]))}</a>: ${escape(item.description["en-US"])}</li>`), "</ul>");
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
  const preload = project.id === data.home && data.splash.sprite ? `${indent}<link rel="preload" as="image" href="${data.splash.sprite.file}" fetchpriority="high">\n` : "";
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
