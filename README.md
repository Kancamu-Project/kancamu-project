# Kancamu

One website that holds the directory and every web app and tool made by Kancamu. The main page lists all projects, and you can search, filter, and open them in tabs inside the same page. Each project has its own folder in the root, so everything is served from a single folder.

Plain HTML, CSS, and JavaScript. No framework, no build step, no special server.

## Features

- A directory of projects in a grid or a list, with search, category and publisher filters, and A-Z or Z-A order.
- Tabs: a project opens inside the page, and you can copy its link or open it in a new window.
- The filters are kept in the URL, so a filtered view can be shared.
- Dark and light themes. The chosen theme and language are remembered by the browser. A change in one web is followed live by all the others, muOS included.
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
  i18n.js        Loads a web's data.json and applies the chosen language (en-US, zh-CN, ar-SA)
  brand.json     The id, the name, and the highlighted word of the brand, the one place they are written (texts say {brand} and {highlight})
  storage.js     The shared data storage: one private repository (<id>-data), one branch per app (drivemu, muai); muAI keeps conversations/ and files/ on its branch
  dialog.js      The shared question and message dialog (dialogs.ask, dialogs.tell); its button texts are in dialog.json. No web uses alert, confirm, or prompt
  autocomplete.js  The autocomplete of every search input (autocomplete.attach)
  account.js     The shared GitHub sign-in: get, onChange, and the dialog (open, bind) that embeds /account
  style.css      Shared styles (fonts, colour tokens, reset, input and select), used by every web except muOS
  fonts/         Inter (woff2), the only font, used by every project
  icons/         Every SVG icon of the main site, Drivemu, and muAI (universal names)
favicon.png      Site icon
RULES.md         Project rules
account/         The account web: GitHub sign-in shown in a dialog by every other web
artcraft/        The eight ArtCraft apps (downloaded by update.ps1)
drivemu/         File storage on GitHub
muai/            AI in the browser
muos/            Desktop in the browser
CNAME            The kancamu.site domain for GitHub Pages
```

Each project is a plain folder with its own `index.html`. Its link in `data.json` is a relative path.

Styles are split in two. `assets/style.css` is loaded by every web except muOS and holds fonts, colour and theme tokens, the reset, and the basics of `input` and `select`. Each web then loads its own `layout.css` (`layout.css`, `drivemu/layout.css`, `muai/layout.css`) for its layout and specific components. Load order: `assets/style.css` first, then `layout.css`.

Colours have two layers in `assets/style.css`. The first is a palette of six colours named after the colour itself: `--black` and `--white` for backgrounds and text, and `--red`, `--yellow`, `--blue`, and `--green` for highlights; there is no gray in the palette. The second is roles (`--bg`, `--bg-1`, `--border`, `--fg`, `--danger`, `--ok`, ...), which are derived from the palette with `color-mix` and change between the dark and light theme. Each theme has two grays, mixes of white and black: `--neutral` for secondary text, and `--neutral-soft` for lines and the second background. Components use role names, or colour names for colours that never change.

In `data.json`, a project's highlight colour (`"color"`) is a palette name such as `"blue"` for projects made here. Projects from other publishers (ArtCraft, TraceDraw) may keep their own colour as hex, for example `"#a78bfa"`.

Every web has four basic files: `index.html`, `layout.css`, `script.js`, and `data.json`. The main site, Drivemu, and muAI each keep them in their own folder. They all load `assets/theme.js` first, and `assets/i18n.js` before their own script.

Every web supports English, Chinese, and Arabic (right to left). All its texts live in its own `data.json` (`ui`, one entry per language) and are marked in the HTML with `data-i18n`, `data-i18n-html`, `data-i18n-title`, `data-i18n-placeholder`, or `data-i18n-label`. A `<select class="language">` lets the user choose, and the choice is kept under the same key (`lang`) for every web. CSS uses logical properties (`inline-start`, `inline-end`) so the layout flips for Arabic. muOS has its own language files, and ArtCraft is a third-party app.

Icons live in one place, `assets/icons/`, and are used as CSS masks so their colour follows the text. File names are universal (`close`, `plus`, `trash`), not specific to a project. Only muOS has icons of its own.

## Running

Nothing needs to be built. Serve this folder with a static web server and open it in the browser.

```powershell
npx http-server . -p 5173 -c-1
```

Avoid servers that remove `index.html` from addresses, such as `npx serve` with its defaults: a page like `muos/apps/store/index.html` is then opened as `muos/apps/store`, and its relative files are looked up in the wrong folder.

Opening `index.html` straight from disk does not work, because `data.json` is loaded with `fetch`.

## Updating ArtCraft

`artcraft/update.ps1` downloads the latest web build (`<app>-web-<version>.zip`) of each ArtCraft app from its GitHub release, checks the SHA-256 against the release's `SHA256SUMS.txt`, and unpacks it into `artcraft/<app>/`, replacing the whole folder. `artcraft/data.json` is the only data file: for each app (WordCraft, GridCraft, DeckCraft, FilmCraft, EffectCraft, PhotoCraft, VectorCraft, PdfCraft) it holds the `storytold` repository and the installed release, so an app that is up to date is not downloaded again. It is plain PowerShell (Windows PowerShell 5.1, built into Windows, or PowerShell 7) and needs nothing installed.

```powershell
powershell -ExecutionPolicy Bypass -File artcraft\update.ps1 -Check
powershell -ExecutionPolicy Bypass -File artcraft\update.ps1
powershell -ExecutionPolicy Bypass -File artcraft\update.ps1 -Only photocraft,deckcraft -Force
```

`-ExecutionPolicy Bypass` applies to that one run only; it does not change the policy of the computer. The script does not touch `data.json`: a new app needs an entry in `artcraft/data.json` and its own entry in the site's `data.json` (see "Adding a project"). The zips carry no icon, so the script keeps the folder's `icon-256.png` or takes the app icon from the repository.

The eight apps add up to about 425 MB. GitHub refuses files over 100 MB, and the biggest wasm file (VectorCraft) is 97 MB, so check the sizes after an update.

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
  "publisher": "{brand}",
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
