# Kancamu Project

One website that holds the directory and every web app and tool made by Kancamu Project. The main page lists all projects, and you can search, filter, and open them in tabs inside the same page. Each project has its own folder in the root, so everything is served from a single folder.

Plain HTML, CSS, and JavaScript. No framework, no build step, no special server.

## Features

- A directory of projects in a grid or a list, with search, category and publisher filters, and A-Z or Z-A order.
- Tabs: a project opens inside the page, and you can copy its link or open it in a new window.
- The filters are kept in the URL, so a filtered view can be shared.
- Dark and light themes. The chosen theme and language are remembered by the browser.
- Three languages: English, 简体中文, and العربية (right to left).

## Projects

| Project | What it is | Location |
|---|---|---|
| muOS | A complete desktop that runs in the browser | `muos/` |
| Drivemu | File storage that keeps its data in the user's own GitHub repository | `drivemu/` |
| muAI | AI models that run directly in the browser | `muai/` |
| ArtCraft | Seven creative and productivity apps: DeckCraft, EffectCraft, FilmCraft, GridCraft, PhotoCraft, VectorCraft, WordCraft | `artcraft/<name>/` |

The directory also lists TraceDraw, an open source vector editor from another publisher. TraceDraw is an outside site, so it is only linked.

## Folder structure

```
index.html       Page skeleton
layout.css       Layout and styles specific to this page
script.js        Logic: list rendering, filters, tabs, language, theme
data.json        All data: projects, categories, languages, and interface text
assets/          Shared assets
  theme.js       Applies the saved theme before the page shows, to avoid a flash
  style.css      Shared styles (fonts, colour tokens, reset, input and select), used by every web except muOS
  fonts/         Inter and JetBrains Mono (woff2), used by every project
  icons/         Every SVG icon of the main site, Drivemu, and muAI (universal names)
favicon.png      Site icon
RULES.md         Project rules
artcraft/        The seven ArtCraft apps
drivemu/         File storage on GitHub
muai/            AI in the browser
muos/            Desktop in the browser
CNAME            The kancamu.site domain for GitHub Pages
```

Each project is a plain folder with its own `index.html`. Its link in `data.json` is a relative path.

Styles are split in two. `assets/style.css` is loaded by every web except muOS and holds fonts, colour and theme tokens, the reset, and the basics of `input` and `select`. Each web then loads its own `layout.css` (`layout.css`, `drivemu/layout.css`, `muai/layout.css`) for its layout and specific components. Load order: `assets/style.css` first, then `layout.css`.

Colours have two layers in `assets/style.css`. The first is a palette of seven colours named after the colour itself: `--black`, `--gray`, and `--white` for backgrounds and borders, and `--red`, `--yellow`, `--blue`, and `--green` for highlights. The second is roles (`--bg`, `--bg-1`, `--border`, `--fg`, `--danger`, `--ok`, ...), which are derived from the palette with `color-mix` and change between the dark and light theme. Components use role names, or colour names for colours that never change.

In `data.json`, a project's highlight colour (`"color"`) is a palette name such as `"blue"` for projects made here. Projects from other publishers (ArtCraft, TraceDraw) may keep their own colour as hex, for example `"#a78bfa"`.

Every web has three basic files: `index.html`, `layout.css`, and `script.js`. The main site, Drivemu, and muAI each keep them in their own folder. They all load `assets/theme.js` first.

Icons live in one place, `assets/icons/`, and are used as CSS masks so their colour follows the text. File names are universal (`close`, `plus`, `trash`), not specific to a project. Only muOS has icons of its own.

## Running

Nothing needs to be built. Serve this folder with a static web server and open it in the browser.

```powershell
npx http-server . -p 5173 -c-1
```

Avoid servers that remove `index.html` from addresses, such as `npx serve` with its defaults: a page like `muos/apps/store/index.html` is then opened as `muos/apps/store`, and its relative files are looked up in the wrong folder.

Opening `index.html` straight from disk does not work, because `data.json` is loaded with `fetch`.

## Adding a project

Everything in the list comes from `data.json`. Add one object to `projects`:

```json
{
  "id": "example",
  "name": { "en-US": "Example" },
  "description": {
    "en-US": "A short description.",
    "zh-CN": "简短描述。",
    "ar-SA": "وصف قصير."
  },
  "highlight": { "en-US": "ex" },
  "publisher": "Kancamu Project",
  "url": "example/",
  "icon": "example/favicon.png",
  "color": "blue",
  "categories": ["tools"]
}
```

- `id` is unique and used in the URL.
- `name` and `description` are written per language. A missing language falls back to `en-US`.
- `highlight` is the part of the name shown in bold on the card, for example `mu` in "muOS".
- `color` is a palette name (`red`, `yellow`, `blue`, or `green`), or a hex value for a project from another publisher.
- `categories` must use keys that exist under `categories` in `data.json`: `ai`, `tools`, `productivity`, `system`, `office`, `design`, `video`, `creative`, `directory`, `storage`.
- New interface text and new category names are written in all three languages.

## Hosting

The site is static and can be served by any static web server, at the root of a domain or under a sub-path, because every link is relative. Serve the whole folder.

## Rules

The rules for language, HTML, CSS, colours, and file layout are in [RULES.md](RULES.md). Only humans may change that file.
