# Kancamu

One website that holds the directory of apps and tools. Most are made by Kancamu; some are from other makers (ArtCraft, TraceDraw), and those are only opened or linked, not made here. The main page lists all projects, and you can search, filter, and open them in tabs inside the same page. Each project has its own folder in the root, so everything is served from a single folder.

Plain HTML, CSS, and JavaScript. No framework, no build step, no special server.

## Features

- A directory of projects in a grid or a list, with search, category, alternative (a project that replaces another product) and publisher filters, and A-Z or Z-A order.
- Tabs: a project opens inside the page, and you can copy its link or open it in a new window.
- The filters are kept in the URL, so a filtered view can be shared.
- Every app keeps what is on its screen (the folder, the tab, the search, the language, the lesson, the chat) in its address, so a reload shows the same. In a tab of the directory, the address of the directory keeps it for the app.
- Dark and light themes. The chosen theme and language are remembered by the browser. A change in one app is followed live by all the others, muOS included.
- Three languages: English, 简体中文, and العربية (right to left).
- Two pages, About and Terms and conditions, and a link to support Kancamu (Saweria, the address is in data.js, "support"), with their buttons in the footer of the main website. Their texts are in the main data.js ("pages"), in the three languages, and the page that is open is in the address (?page=terms).
- Every app has Open Graph tags and its own preview image, so a link to it looks right where it is shared.
- A splash screen: when the main website opens, a layer with the logo, the name, and three images (they slide every few seconds, in order) shows until a click or a key; it can be turned off in the Appearance page of the account app.
- Effects, set in the Appearance page of the account app and shared by every app (except muOS and ArtCraft): today a noise (a fine grain over the page, with an amount and an option to make it move) and a monochrome (the colour taken out, with an amount). An effect is only a layer over the page: a div of its own in the body, which takes no click and changes no element of the page (no style or attribute on any other element), and the noise stays still when the device asks for less motion.

## Projects

| Project | What it is | Location |
|---|---|---|
| muOS | A complete desktop that runs in the browser | `muos/` |
| Drivemu | File storage that keeps its data in the user's own GitHub repository | `drivemu/` |
| Gallemu | A gallery of the images and videos in the user's Drive | `gallemu/` |
| Guyonmu | Short posts, replies, likes, and follows (the server is a Cloudflare Worker with a D1 database, `assets/tools/guyonmu/`) | `guyonmu/` |
| Spotimu | A music player for the audio files in the user's Drive | `spotimu/` |
| muJS | Lessons that teach JavaScript, with an editor that runs the code in a sandbox and checks it with tests; the progress is kept on the user's account | `mujs/` |
| Lingomu | Short lessons that teach the words of a language (hearts, XP, daily goal, streak); the progress is kept on the user's account | `lingomu/` |
| Picmu | Removes the background of an image or a video, and upscales an image or a video (x2 and x4), with models that run on the graphics card (WebGPU) | `picmu/` |
| Transmu | Translates text between eight languages with AI models that run in the browser (Opus-MT, NLLB-200, M2M100) | `transmu/` |
| Speechmu | Turns speech into text (Whisper: tiny, base, small) and text into speech (MMS voices and the voices of the device) with AI models that run in the browser; eight languages | `speechmu/` |
| Hashmu | Hashes a text or a file (MD5, SHA-1, SHA-256, SHA-384, SHA-512, and HMAC), encrypts a text with a passphrase (AES-256-GCM), makes passwords and keys, and encodes (Base64, Hex, URL); all in the browser | `hashmu/` |
| Searchmu | The advanced search of Google: fields for the words, the exact phrase, the words to leave out, a range of numbers, the language, the region, the last update, a site, a type of file, and usage rights; the results of Google show in a frame beside the fields | `searchmu/` |
| Homu | A start page for your browser: the language and the theme in its header, a clock, the date, and a greeting (each can be turned off, and the hours can be 12 or 24), a search box in the middle that searches the web with the engine of your choice (Google, DuckDuckGo, Bing, Brave, Baidu, or Yandex) or opens an address (press `/` to reach it from anywhere on the page; it keeps a history of your searches, which can be turned off or deleted in the settings, and offers it, and the names of your bookmarks, as you type), and your bookmarks under it, in groups (add, edit, delete, move earlier or later or drag them, and find them as you type). The bookmarks are kept in this browser; the settings of the app export them, import them (its own file, or the bookmarks that a browser exported as HTML, where each folder becomes a group), or delete them | `homu/` |
| Youmu | The sign-in, the profile, and the settings of every app | `youmu/` |
| Assetmu | Shows every asset of the apps: colours (they follow the theme), the colour and icon of each app, icons, fonts, sizes, and files | `assetmu/` |
| Kitmu | The UI kit of the apps: the templates, the helpers, and the popups, each with the code to copy and a way to try it | `kitmu/` |
| muAI | AI models that run directly in the browser, or an OpenAI-compatible API (OpenAI, OpenRouter, Ollama, LM Studio…) that works as an agent: with `muai-helper` it plans a long task and does it step by step, listing, searching, reading, writing, and editing files in one folder of your PC | `muai/` |
| ArtCraft | Seven creative and productivity apps: DeckCraft, EffectCraft, FilmCraft, GridCraft, PhotoCraft, VectorCraft, WordCraft | `artcraft/<name>/` |

The directory also lists TraceDraw, an open source vector editor from another publisher. TraceDraw is an outside site, so it is only linked.

## Folder structure

```
index.html       Page skeleton
layout.css       Layout and styles specific to this page
app.js        Logic: list rendering, filters, tabs, language, theme
data.js        All data: projects, categories, languages, and interface text
assets/          Shared assets, in folders
  css/           The styles
    shared.css       One file, in parts: style (fonts, colour tokens, reset, input and select), components (icons, buttons, the search box, the alert, the card, the chat parts and the rest, shown in Kitmu), and page (the header, the footer, the main, and the sidebar with its drawer, only for a body with the class page)
  js/            The scripts (ES modules)
    shared.js        One file, in parts: icons (a variable --icon-<name> for each icon), theme (the saved theme and the effects of the Appearance page, before the page shows), cleanup (what older versions left in the browser), url (urlState.get, urlState.set), i18n (the language), popup (popups.ask, popups.tell, popups.toast), components (the helpers and the tags kit-*: element, icon, formatSize, menu, popover, calendar, dataTable, questionnaire, kit-alert, kit-card, kit-header, and more), autocomplete, account (the shared GitHub sign-in), transfer (files dragged out of an app), settings (the settings of every app), and storage (the shared data storage: one private repository <id>-data)
  data/          What the scripts read
    data.js      One file, a named export for each part: brand (the id, the name, and the highlighted word, the one place they are written; texts say {brand} and {highlight}), popup (the texts of the buttons of the popups), kit (the texts of the tags kit-*), appearance (the Appearance page of the account app: the splash screen and the effects), auth (the sign-in with GitHub: the account app, the client id, the scope, and the address of the Worker), drive (the app whose folder holds the drive of the storage), and cleanup (the keys, databases, and caches that older versions left in the browser and that are deleted)
  fonts/         Inter (woff2), used by every app, and JetBrains Mono (woff2), used by muOS
  images/        The images that are content of the site (the splash screen): WebP, compressed, with the original beside each as <name>_raw; splash.webp and icons.png are the sprites (see assets/tools/sprites.mjs), the single files stay
  icons/         icons.js: every SVG icon of the apps, in one file (universal names); shared.js makes a variable --icon-<name> of each
favicon.png      Site icon
assets/tools/    What helps to make the project: og-cards.mjs makes the preview.png of the main website and of every app from their cards (node assets/tools/og-cards.mjs); the cards are shown all at once in the section Previews of Assetmu, where each can be saved as an image; muai-helper/ is the Rust program that lets muAI work with the files of one folder of your PC (one command in a terminal downloads and runs it, and muAI connects by itself: see its README), with its install scripts, its programs (`bin/`), and the workflow that builds them for every system (`.github/workflows/muai-helper-release.yml`); sprites.mjs makes the sprites (the images of the splash screen in one square file, assets/images/splash.webp, and the icons of all the apps (16 px for the pixel icons, at most 48 px for the others) in one, assets/images/icons.webp; node assets/tools/sprites.mjs); seo.mjs makes sitemap.xml, robots.txt, and the title, the canonical address, the structured data, and the noscript text of every page (node assets/tools/seo.mjs); repo-card.mjs makes the image of the repository for social networks (.github/social-preview.png, 1280x640; node assets/tools/repo-card.mjs); desktop/ is the website in its own window (Tauri, Rust), which can install the native ArtCraft apps (see Desktop app); auth/ is the sign-in with GitHub (a Cloudflare Worker) that keeps the client secret a static site cannot keep (see its README); guyonmu/ is the server of Guyonmu (a Cloudflare Worker with a D1 database; see its README)
preview.png      Open Graph image (1200x630): the card of the main website, which is its splash screen (node assets/tools/og-cards.mjs kancamu), made again when the splash changes, with the number after ?v= raised in the og:image of index.html
RULES.md         Project rules
assetmu/         Assetmu: shows every asset (colours, icons, fonts, sizes, files) and the colour and icon of each app
kitmu/          Kitmu: the UI kit (templates of assets/css/shared.css, helpers and popups of assets/js/shared.js)
speechmu/       Speech to text (Transformers.js, Whisper; a file or the microphone; saved as text or SRT subtitles) and text to speech (MMS voices that download once, and the voices of the device; saved as WAV); nothing is uploaded
hashmu/         Hashing and cryptography in the browser (the Web Crypto API; nothing is uploaded): hashes of a text or a file, HMAC, encrypting a text, random passwords and keys, and Base64, Hex, and URL encoding; what the user types in a field is never in the address
searchmu/       The advanced search of Google: the fields make a query and the filters of Google, and its results are shown in a frame (what the user types in a field is never in the address)
homu/           A start page for the browser: the clock and the date, a search box in the middle (it searches the web with the engine that is chosen in the settings, or opens an address that is typed), and the bookmarks of the user in groups under it, which the box also filters
youmu/       The account app, shown in a dialog by every other app; the query string picks the page: ?page=login, ?page=profile, ?page=settings&app=<app>. All settings of all apps (language, theme, and the settings, models, and data of each app) are set here
artcraft/        The eight ArtCraft apps (downloaded by update.ps1)
drivemu/         File storage on GitHub
gallemu/        Gallery of the images and videos of the Drive (reads the Drive, read only)
guyonmu/        Social app of short posts, with images (when R2 is on), edits, replies, likes, reposts, saved posts, links to share, notifications, blocks, mutes, and reports for the moderators (the posts, likes, reposts, saves, and follows are on the server of assets/tools/guyonmu, signed in with the GitHub account of the account app; opens on the timeline, the address keeps ?tab, ?user, ?post, ?q)
spotimu/        Music player for the audio files of the Drive (reads the Drive, read only)
mujs/           JavaScript lessons (units, lessons and tests are in data.js; the code runs in a sandboxed frame, sandbox.js; the progress is in the mujs folder)
lingomu/        Language lessons (courses, units and lessons are in data.js; the progress is in the lingomu folder)
picmu/          Images and videos in the browser (WebGPU, nothing is uploaded), two tools in tabs: remove the background (RMBG 1.4, BiRefNet lite, MODNet) and upscale (Swin2SR, x2 and x4, a tile at a time); images and videos (frame by frame, saved as WebM, MP4, GIF or a ZIP of PNG frames; a removed background is transparent, white, black or any colour); can take a file from the Drive and save the result to it; every tool has its own model, chosen in the page or in the account app
transmu/        Translator in the browser (Transformers.js; Opus-MT, NLLB-200 or M2M100, chosen in a select; nothing is uploaded); Opus-MT uses English as the bridge between two other languages
muai/            AI in the browser, or through an OpenAI-compatible API; the key of the API and the token of muai-helper stay in this browser (localStorage), never in the synced settings
muos/            Desktop in the browser
CNAME            The kancamu.site domain for GitHub Pages
```

Each project is a plain folder with its own `index.html`. Its link in `data.js` is a relative path.

Styles are split in two. `assets/css/shared.css` is loaded by every app except muOS and holds fonts, colour and theme tokens, the reset, and the basics of `input` and `select`. Each app then loads its own `layout.css` (`layout.css`, `drivemu/layout.css`, `muai/layout.css`) for its layout and specific components. Load order: `assets/css/shared.css` first, then `layout.css`.

Colours have two layers in `assets/css/shared.css`. The first is a palette of six colours named after the colour itself: `--black` and `--white` for backgrounds and text, and `--red`, `--yellow`, `--blue`, and `--green` for highlights; there is no gray in the palette. The second is roles (`--bg`, `--bg-1`, `--border`, `--fg`, `--danger`, `--ok`, ...), which are derived from the palette with `color-mix` and change between the dark and light theme. Each theme has two grays, mixes of white and black: `--neutral` for secondary text, and `--neutral-soft` for lines and the second background. Components use role names, or colour names for colours that never change.

In `data.js`, a project's highlight colour (`"color"`) is a palette name such as `"blue"` for projects made here. Projects from other publishers (ArtCraft, TraceDraw) may keep their own colour as hex, for example `"#a78bfa"`.
A category can have a colour in `categoryColors` of `data.js` (a palette name, such as `"blue"`): its filter button and its tags take it, and no CSS names a category.

Every app has four basic files: `index.html`, `layout.css`, `app.js`, and `data.js`. The main site, Drivemu, and muAI each keep them in their own folder. They all load `assets/css/shared.css` and `assets/js/shared.js` before their own files, and `data.js` is the data of the app (`export default {...}`, which `app.js` imports).

Every app supports English, Chinese, and Arabic (right to left). All its texts live in its own `data.js` (`ui`, one entry per language) and are marked in the HTML with `data-i18n`, `data-i18n-html`, `data-i18n-title`, `data-i18n-placeholder`, or `data-i18n-label`. A `<select class="language">` lets the user choose, and the choice is kept under the same key (`lang`) for every app. CSS uses logical properties (`inline-start`, `inline-end`) so the layout flips for Arabic. muOS has its own language files, and ArtCraft is a third-party app.

Icons live in one place, `assets/icons/`, and are used as CSS masks so their colour follows the text. File names are universal (`close`, `plus`, `trash`), not specific to a project. Only muOS has icons of its own.

## Desktop app

`assets/tools/desktop/` is a small Tauri app (Rust) that opens https://kancamu.site in a window. The website knows it runs there, and then the menu (the three dots) of an ArtCraft project also offers to install the native app, to update it, to open it, and to remove it. The window is only a window: everything else is the website.

```
cd assets/tools/desktop
cargo run
```

On Windows it needs Rust with the MSVC toolchain (`rustup toolchain install stable-x86_64-pc-windows-msvc`) and the C++ build tools of Visual Studio; the window uses WebView2, which Windows 11 has. Installing native apps works on Windows only for now (the other systems answer that it is not supported).

- How the website knows: `desktop.available` (assets/js/shared.js, part desktop) is true when the window gives the page the global of Tauri. It is a test of what exists, never of the name of a browser, and it is false in every ordinary browser.
- What the website may ask: four commands (`native_status`, `native_install`, `native_open`, `native_remove`), and only from the addresses in `assets/tools/desktop/capabilities/site.json` (https://kancamu.site and http://localhost:5173). From any other address the app answers that the command is not allowed.
- What a command takes: the id of an app (`"native": "deckcraft"` in the data.js of the main website), never an address. The app looks the id up in its own list (`catalog.rs`), so the page cannot make it download anything else.
- What an install does: it asks GitHub for the latest release of that app, picks the file for this computer (the portable zip when there is one, because it needs no administrator, else the MSI), checks it against the SHA-256 that the release publishes (a release without one is not installed), and unpacks or runs it. The apps are kept in `%LOCALAPPDATA%\site.kancamu.app`, with their list in `state.json`.
- The icon: the only file is `assets/tools/desktop/icons/icon.ico`, which is the `favicon.png` of the site made bigger, pixel by pixel (the logo is a pixel icon). Windows needs it to build the app (the build stops without it); the window takes its icon from it too, so there is no png.
- Not done yet: the progress of a download is not shown (the page only says that it is installing, and then the result), and the other systems.

To try the site that is on your PC in the window, change `url` of the window and `frontendDist` in `assets/tools/desktop/tauri.conf.json` to `http://localhost:5173/` and serve the folder there; change it back before you commit.

The automatic build is `.github/workflows/desktop-release.yml`: it tests and builds on every push that changes the app, and when a tag `desktop-v<version>` is pushed it also puts the program in `assets/tools/desktop/bin/` with its SHA-256 in `latest.txt` (see the README of that folder).

## Files that are never committed

`.gitignore` keeps these out, and a new kind of secret is added to it in the same change:

- `.dev.vars`, `.env`, `.env.*`, `*.secret`: the client secret of the sign-in (`assets/tools/auth/.dev.vars`), the session secret of Guyonmu (`assets/tools/guyonmu/.dev.vars`), and any other secret.
- `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.keystore`, `*.jks`: keys and certificates, such as the signing of the desktop app.
- `node_modules/`, `target/`, `assets/tools/desktop/gen/`, `.wrangler/`: what is built or kept by a tool.
- `assets/images/*_raw.*`: the originals of the images of the splash.
- `muos/_references/`, `.claude/`, `.vscode/`, `.idea/`, logs, and the files of the operating system.

Before the first push of a new folder, look at `git status` and at `git ls-files --others --exclude-standard`, and check a suspect file with `git check-ignore -v <file>`.

## Running

Nothing needs to be built. Serve this folder with a static web server and open it in the browser.

```powershell
npx http-server . -p 5173 -c-1
```

Avoid servers that remove `index.html` from addresses, such as `npx serve` with its defaults: a page like `muos/apps/store/index.html` is then opened as `muos/apps/store`, and its relative files are looked up in the wrong folder.

Opening `index.html` straight from disk does not work, because `data.js` is loaded with `fetch`.

## Updating ArtCraft

`artcraft/update.ps1` downloads the latest web build (`<app>-web-<version>.zip`) of each ArtCraft app from its GitHub release, checks the SHA-256 against the release's `SHA256SUMS.txt`, and unpacks it into `artcraft/<app>/`, replacing the whole folder. `artcraft/data.json` is the only data file: for each app (WordCraft, GridCraft, DeckCraft, FilmCraft, EffectCraft, PhotoCraft, VectorCraft, PdfCraft) it holds the `storytold` repository and the installed release, so an app that is up to date is not downloaded again. It is plain PowerShell (Windows PowerShell 5.1, built into Windows, or PowerShell 7) and needs nothing installed.

```powershell
powershell -ExecutionPolicy Bypass -File artcraft\update.ps1 -Check
powershell -ExecutionPolicy Bypass -File artcraft\update.ps1
powershell -ExecutionPolicy Bypass -File artcraft\update.ps1 -Only photocraft,deckcraft -Force
```

`-ExecutionPolicy Bypass` applies to that one run only; it does not change the policy of the computer. The script does not touch `data.js`: a new app needs an entry in `artcraft/data.json` and its own entry in the site's `data.js` (see "Adding a project"). The zips carry no icon, so the script keeps the folder's `icon-256.png` or takes the app icon from the repository.

The eight apps add up to about 425 MB. GitHub refuses files over 100 MB, and the biggest wasm file (VectorCraft) is 97 MB, so check the sizes after an update.

## Adding a project

Everything in the list comes from `data.js`. Add one object to `projects`:

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
  "categories": ["tools"],
  "alternatives": ["Microsoft Word", "Google Docs"]
}
```

- `id` is unique and used in the URL.
- `name` and `description` are written per language. A missing language falls back to `en-US`.
- `highlight` is the part of the name shown in bold on the card, for example `mu` in "muOS".
- `color` is a palette name (`red`, `yellow`, `blue`, or `green`), or a hex value for a project from another publisher.
- `categories` must use keys that exist under `categories` in `data.js`: `ai`, `tools`, `productivity`, `system`, `office`, `design`, `video`, `creative`, `directory`, `storage`.
- `source` (only for a project of another maker) is the address of its source on GitHub: it is the "Source on GitHub" item in the menu of the three dots of its card. The projects of Kancamu have none.
- `alternatives` lists the products the project is an alternative to (one or more, product names are not translated; `[]` for none). The directory has a filter for them, and the search also finds them.
- New interface text and new category names are written in all three languages.

## Hosting

The site is static and can be served by any static web server, at the root of a domain or under a sub-path, because every link is relative. Serve the whole folder.

## License

Copyright (c) 2026 Yuxie.

The code is free under the GNU Affero General Public License, version 3 or any later version ([LICENSE](LICENSE)): you may use, change, and share it, and whoever shares a changed version, or lets people use it through a network (a website, for example), must give them the source of the changes under the same license.

The brand and the images and icons of the owner are not under that license: they are shared under CC BY-NC-ND 4.0 (copy and share unchanged, with credit, not for commercial use). What others made (ArtCraft, muOS, the fonts, the images of the splash screen) keeps the license of its makers. [ASSETS.md](ASSETS.md) lists every file that is not under the code license, and what is still to be checked.

## Rules

The rules for language, HTML, CSS, colours, and file layout are in [RULES.md](RULES.md): the written language, the supported languages, the popups (every notice is a toast), the address (what is on the screen is in the query string), the words, the page layout, the templates, and the storage.

## Reference: what the code does

The code has no comments (RULES.md, General): what it does and how to use it is written here.

### assets/js/shared.js

```
The shared code of the apps, in one file (the page asks for one file, and not for one per part). Every part is a block of its own, so its names stay in it, and what the apps use is exported:
  urlState, i18n, popups, components, autocomplete, account, transfer, settings, storage
The parts are in this order, and a part may use the ones before it (and, when it is called later, the ones after it): theme, cleanup, url, i18n, popup, components, autocomplete, account, transfer, settings, storage.
The data is in assets/data/data.js, and the icons are in assets/icons/icons.js (the part icons, the first one, makes a variable of each).
```

### assets/js/shared.js, part icons

```
Every icon of assets/icons/icons.js is a variable of :root, --icon-<name>, that holds a data address of its SVG; the CSS uses it as a mask (mask: var(--icon-search) center / contain no-repeat).
It is made first, so the icons are there when the page is shown.
```

### assets/js/shared.js, part theme

```
Runs before first paint so a saved light theme does not flash dark.
Also follows the theme chosen in any other app of this site (same origin) while this page is open.
The effects of the Appearance page of the account app are applied here too, as layers: a div of its own (div.effect, directly in the body) for each effect that is on, and none
when it is off (the look is in assets/css/shared.css). Nothing is written on html, on body, or on any other element, and no style of the page is changed. They are the settings
"appearance" (localStorage "appearance.settings"), and there is nothing to add until the user turns one on, so nothing is written here as a default.
The apps have no default menu on a right click (the ones that have a menu of their own make it themselves)
```

### assets/js/shared.js, part cleanup

```
Deletes what an older version of the code left in this browser and that the code of today does not use any more.
The apps of Kancamu, muOS, and the apps of ArtCraft all run on one origin and share its localStorage, its databases, and its caches, so this file never deletes
"what it does not know": it deletes the names that are listed here, and only those. A name is added to a list when the code stops using it:
  - the key of localStorage that is not read or written by any app any more        (LOCAL_KEYS)
  - the database of IndexedDB or the cache of Cache Storage that no app opens now  (DATABASES, CACHES)
What the code of today uses is not here: theme, lang, account, <app>.settings, lingomu.progress, mujs.progress, drivemu.view, muai.seen.<model>,
the database "muai", and the cache "transformers-cache". (A token that is not of the sign-in with GitHub is deleted by assets/js/shared.js.)
```

### assets/js/shared.js, part url

```
Where an app keeps what is on its screen, so a reload shows the same thing: the address of the page (its query string).
An app reads it when it starts and writes it when the user changes something; it keeps only what is not the first value, so the address of a fresh page is clean.
  const folder = urlState.get("path");                  the text of a parameter, or "" when it is not there
  urlState.set({ path: "Images", view: "", q: "cat" }); writes the parameters that are given; "", null, undefined, and false take a parameter away
The apps of Kancamu open in frames of the main site: the address of the frame is not the address that the user reloads, so every change is also told to the main site
(it keeps the query string of each tab in its own address), and the main site opens the frame with it the next time. An app that is not in a frame only has its own address.
The history is not filled: the address is replaced, not added to.
```

### assets/js/shared.js, part i18n

```
Language support shared by every app (except muOS and ArtCraft).
An app keeps its texts in its own data.js:
  { "name": { "en-US": "..." }, "languages": [{ "code", "name", "dir" }], "ui": { "key": { "en-US": "...", ... } } }
The rest of the data of the app is in the same file too (the projects of the main website, the models of muAI, the file types of Drivemu): app.js reads it from i18n.data.
Mark elements in the HTML with data-i18n (text), data-i18n-html (text with <b>/<i>, from our own data.js),
data-i18n-title, data-i18n-placeholder, or data-i18n-label (aria-label), then call i18n.load().
A tag kit-* (assets/js/shared.js) takes a text for any of its attributes the same way: data-i18n-heading="key" gives heading the text of the key.
assets/data/data.js is in the folder data, beside the folder of this script. The name of the brand and its highlighted word are written there and nowhere else.
```

### assets/js/shared.js, part popup

```
Everything that pops up over the page, in every app: the questions and messages (dialogs) and the short notes (toasts).
An app never uses alert, confirm, or prompt of the browser, and never makes a popup of its own. The look is in assets/css/shared.css (.shared-dialog*, .shared-toast*), the same in every app.

A dialog, which waits for an answer:
  if (await popups.ask({ text: "Delete this chat?", ok: "Delete" })) { ... }       true when the user confirms, false when not
  const name = await popups.ask({ text: "Chat name:", value: "Old name" });         the text the user typed, or null when cancelled
  await popups.tell({ text: "Saved." });                                            a message with one button
  The options are text, title, ok, cancel (the texts of the buttons; they are in the language of the page when not given), value, and kind (the border: info, warning, error, or success; none is the normal border).

A sheet, a panel at an edge of the page (a drawer is a sheet at the bottom); it waits until it is closed:
  await popups.sheet({ title: "Edit profile", text: "What is in it.", side: "end" });    side: start, end (the default), top, or bottom
  await popups.sheet({ title: "Filters", node: someElement, side: "bottom" });             a node instead of a text

A command, a search with a list under it; it gives the value of the item that is picked, or null:
  const value = await popups.command({ items: [{ label: "Open", hint: "Ctrl O", value: "open" }] });

A toast, a short note at the bottom of the page that goes away by itself:
  popups.toast("Copied.");
  popups.toast("Failed.", { kind: "error" });                                       the kind gives the colour of the border and the icon
  const note = popups.toast("Deleting...", { kind: "info", duration: 0 });          stays until it is closed
  note.set("Still deleting..."); note.close();
  const bar = popups.toast("Uploading...", { duration: 0, progress: 0 });           with a progress bar (0 to 1)
  bar.set("Uploading 3 of 9", 0.33); bar.close();
  The options are kind, duration (milliseconds; 0 stays until closed), and progress.
  The kinds are the colours with their meaning: success (green, a good thing, the default), info (blue, neutral, the default with progress),
  warning (yellow, be careful), and error (red, a bad or sensitive thing: a failure, a deletion). An error and a warning stay longer.

The texts of the buttons are in the part popup of assets/data/data.js, in every supported language. It is in the same file as i18n (assets/js/shared.js).
```

### assets/js/shared.js, part components

```
The small helpers that every app wrote again, made once. They go with the templates of shared.css; Kitmu shows each of them.
  components.element("div", "card", "Text")                  an element with a class and a text
  components.icon("trash")                                   <span class="icon icon-trash"></span>
  components.formatSize(1536000)                             "1.5 MB", with the numbers of the language of the page
  components.extensionOf("Image.PNG")                        "png" (an empty text when there is no dot)
  const say = components.status(document.getElementById("status"));
  say("Choose a file.");                                     the hint line of the footer (a notice is a popup: popups.toast)
  const menu = components.drawer({ sidebar, button });       the sidebar that opens over the main on a narrow screen
  menu.set(true);                                            opens it (Escape closes it and gives the focus back to the button)
  components.download("notes.txt", "Hello", "text/plain");   saves a text or a Blob as a file
  components.expand({ toggle, body, open: false });          a button that opens and closes its body (the expandable part of the template)
  components.menu({ anchor, items });                         a menu under a button (items: { label, icon, danger, onSelect } or { separator: true });
                                                              onSelect that gives false keeps it open; { point: { x, y } } instead of anchor is a context menu
  components.select({ trigger, options, value, onChange });   a button that shows the value and opens a menu of the options
  components.otp({ length, onComplete });                     one input for each character of a code (its element is .element)
  components.resizable(container);                            the handle between two panels moves with the pointer and the arrows
  components.carousel(root);                                  the buttons data-carousel="previous" and "next" move the track
  components.calendar({ selected, onSelect });                a month of days (its element is .element)
  components.chart({ type: "bar" or "line", data });          an svg; data is [{ label, value }]
  components.dataTable({ columns, rows, pageSize, labels });  a table with a filter, a sort on each column, and pages
  components.scroller(container);                             follow() keeps the end in view only while the reader is at the end
  components.questionnaire({ items, labels, onSubmit });      questions one after another, with choices
  <kit-alert kind="error" heading="Failed">The text.</kit-alert>   a component with several parts is one tag: kit-alert, kit-card, kit-item, kit-empty, kit-attachment, kit-message.
                                                              It builds its parts, so a change of the component reaches every app; the attributes are properties too (element.heading = "...").
  components.make("alert", { kind: "error", heading: "Failed" }, ["The text."])   the same from a script
  The parts of the page are tags too: <kit-header theme menu>, <kit-sidebar>, <kit-footer status>; and kit-collapsible, kit-breadcrumbs, kit-tabs, kit-pagination,
  kit-trace-line, kit-marker, kit-field, kit-search. Their texts that are the same in every app (the account button, the copyright) are in assets/data/data.js.
  components.closeOverlay();                                  closes the menu or the popover that is open
  components.popover({ anchor, content });                    a panel with anything in it, under a button; both close on Escape, on a click outside, on a scroll
```

### assets/js/shared.js, part autocomplete

```
Autocomplete for the search inputs of every app: while the user types, a list of suggestions shows under the input.
  autocomplete.attach(input, { suggestions: () => ["Documents", "Images"] });
suggestions gives the texts to offer (it is asked each time the user types, so it can follow what the page shows).
A suggestion that is picked is put in the input, and the input gets an "input" event, so the search runs as if it was typed.
Keys: arrow down and up move through the list, Enter picks the marked suggestion, Escape closes the list.
The list is drawn by the page itself (not the datalist of the browser), in the style of the app (see assets/css/shared.css).
```

### assets/js/shared.js, part account

```
The GitHub sign-in shared by every app (they all run on one origin).
The account is kept in localStorage under the key "account" as { token, login, name, avatar }.
Sign in once in any app and every other app, open or opened later, knows it.
The sign-in is "Sign in with GitHub" (an OAuth App): account.signInWithGitHub() sends the whole page to GitHub, GitHub sends it back to youmu/callback.html,
and account.finishSignIn() trades the code for a token through the Worker of kancamu-auth (the only place that knows the client secret).
The token has the scope "repo" (assets/data/data.js), because the storage of the apps is a private repository of the user.
A token that GitHub made to expire is not an account any more once it has: the apps ask for the sign-in again.

The sign-in screen, the profile, and the settings of every app are pages of the account app (/youmu), chosen by the query string
(?page=login, ?page=profile, ?page=settings&app=<app>), so no other web builds its own:
  account.open()              opens the account app in a dialog over the current page: the profile, or the sign-in when there is no account
  account.open("settings")    opens a page of it: "login", "profile", or "settings"
  account.bind(btn)           makes a button with the class "account" open the settings of the app (the profile or the sign-in when the app has none),
                              and show the avatar when signed in
An app has one button for all of it. The dialog knows the app that opened it (the first folder of the address, such as muai), so it opens on the settings
of that app; the sidebar of the account app has the profile and the settings of every other app.
```

### assets/js/shared.js, part transfer

```
TODO: this file and the main website work around what the browser does not give (see TODO.md, "Retest"). Retest it from time to time, to make it plain.
Files of the Drive that can be dragged out of an app, with the types of drag that the browsers know.
 - An image is dragged as a real <img> with the whole image, so the drop area of any app (ours or somebody else's) gets it as a file (dataTransfer.files), like a
   file of the computer. A page cannot put a file in a drag by itself (Chrome drops it), so the file is given to the browser as an image: an invisible <img> lies over
   the element, and is the thing that is dragged.
 - Any other file (a video, a document) is dragged as a link (text/uri-list) to the file, and its name (text/plain). The browsers have no drag that carries such a file
   to another site; the apps of Kancamu take the link and read the file from it (transfer.take).
The file has to be there when the drag starts, so it is read from the Drive while the pointer is over the element.
  transfer.drag(element, source, region)   makes an element draggable as a file; source is { id, name, size, image, load }, or a function that gives it (for a
                                           viewer that shows one file after another); load() gives the Blob. region is a function that gives the part of the element
                                           where an image is dragged (the whole element if left out).
  await transfer.take(event)               the files of a drop: the ones of the computer, an image of the Drive, or a file of the Drive that came as a link
  The main website is told (a message to the parent page) which file an app drags, and gives it to the app of any tab as a real file (see app.js).
  transfer.dragging                        true while a file of this page is being dragged (a page does not take its own file)
```

### assets/js/shared.js, part settings

```
The settings of the apps, shared by every app (they all run on one origin).
Everything of an app that the user can adjust (except how a list is shown and sorted) is one of its settings, kept in localStorage under "<app>.settings",
and can be set in the account app (/youmu/?page=settings&app=<app>, opened by the account button of the app). An app has no settings screen of its own,
but it can keep a control for a setting in its page: the control and the account app write the same settings, and each follows the other.
  settings.set("muai", values)               saves the settings of the app (the control of an app, and the account app)
  settings.get("muai", defaults)              the settings of the app: the defaults, over which the saved values
  settings.onChange("muai", defaults, fn)     runs fn(settings) when the account app saves a change
  settings.listen("muai", fn)                 runs fn(message) when the account app did something to the data of the app
                                              (deleted its chats, reset its drive...), so the app shows what is left
Only the account app calls reset and announce.
```

### assets/js/shared.js, part storage

```
The GitHub storage shared by the apps that keep data for the user (they all run on one origin).
One private repository named after the brand (<id>-data, with the id of assets/data/data.js), on its default branch (main).
Every app has a folder of its own in the folder AppData: AppData/drivemu, AppData/muai, AppData/lingomu, and so on. An app only touches its own folder,
and the paths that it gives are inside that folder (the folder is added here), so "a.json" of muai is AppData/muai/a.json in the repository.
The Drive is not the folder of an app: it is the whole repository, as Drivemu shows it like a file explorer (Documents, Images, Videos, and Audio are next to AppData,
and AppData is a folder like the others in it). storage.drive() opens it, and its paths are the ones of the repository.
  const store = await storage.connect("muai");           opens the folder of the app, creating the repository when it is not there yet
  const drive = await storage.drive();                   opens the whole repository (the Drive)
  const text = await storage.readFile(store, "a.json");  the text of a file of the folder, or null
  await storage.writeFile(store, "a.json", text);        saves a file of the folder, and gives its new sha
  await storage.list(store, "folder");                   [{ name, sha }] of a folder inside the folder of the app
  await storage.tree(store);                             { files: [{ path, size }], truncated } every file of the folder of the app, in every folder
  await storage.readBinary(store, "a.jpg");              the bytes of a file (a Uint8Array), or null
  await storage.writeBinary(store, "a.jpg", bytes);      saves bytes
  await storage.removeFile(store, "a.json");             deletes a file
store.root is the whole folder of the app in the repository ("AppData/muai", and "" for the Drive), and store.system (for the Drive) the names at the root of the repository
that are not files that the user made: AppData and README.md, and store.own (for the Drive) the folder of the data of Drivemu itself, AppData/drivemu.
An app that works with the git data API itself (Drivemu, the reset of the account app) uses them.
The repository is made without a README: its first commit is the empty file AppData/.gitkeep.
Two apps may save at the same moment on the same branch: GitHub then answers 409, and a save or a delete is tried again.
The account (assets/js/shared.js) must be signed in.
```

### assets/js/shared.js, part desktop

`desktop` is one object, written once, for what only the desktop app (`assets/tools/desktop/`) can do. `desktop.available` says whether the page runs in it (the global of Tauri is there), and `desktop.call(command, args)` asks the app and gives a promise: the answer, or an error that says why not (the address is not allowed, the app is not in the list, it is not installed). An app of the website asks `desktop.available` first, and shows the extra only when it is true. Today only the menu of the main website uses it (`nativeItems` in its app.js), for a project that has `"native"` in its data.js.

### assets/tools/seo.mjs

```
Makes what a search engine reads in the pages of Kancamu (RULES.md, HTML 10): sitemap.xml, robots.txt, and, in the index.html of the main website and of every app,
the title, the canonical address, the structured data (JSON-LD), the preload of the image of the splash screen (main website), and a text for the visitors without JavaScript (<noscript>, with the link to the main website and, on the main website, to the apps).
Everything comes from the main data.js (the name, the description, the categories), so it follows an app that changes or is added. It is safe to run again: its parts are between markers.
  node assets/tools/seo.mjs
It needs Node 20 or newer. The address of the website is in CNAME.
```

### assets/tools/og-cards.mjs

```
Makes the preview image of the main website and of every app of Kancamu (preview.png, 1200x630): the images that the Open Graph tags point to (RULES.md, HTML 9).
The images are not drawn here. Their source is the cards of the section Previews of Assetmu (in assetmu/app.js, shown alone with assetmu/?preview=<app>): this script
opens each card in Chrome, in a window of 1200 x 630, and takes its picture. (The button "Save as image" of Assetmu makes the same image from the same card.)
Run it again when the name, the description, the icon, or the colour of an app changes, or the first image of the splash screen, and raise the number of "?v=" in the og:image
of the app, so the sites that keep the old image in their cache ask for the new one.
  node assets/tools/og-cards.mjs            the main website and every app
  node assets/tools/og-cards.mjs hashmu     one of them, by its id (kancamu is the main website)
It needs Node 20 or newer and Chrome (the address of chrome.exe is in the variable CHROME when it is not at its usual place).
```

### assets/tools/repo-card.mjs

```
Makes the social preview of the repository, .github/social-preview.png (1280x640, the size that GitHub asks for), from the data of the site: the logo and the name with its highlighted word (assets/data/data.js), the line of the splash screen (the "splash.tagline" of data.js), the license, and the icons of the apps made here.
Everything important is inside a border of 80 px (40 pt), so nothing is cropped. The image is drawn by Chrome from a page that the script writes in a temporary folder.
  node assets/tools/repo-card.mjs                  makes .github/social-preview.png
  node assets/tools/repo-card.mjs <file>           makes it at another place (the path is from the root of the repository)
It needs Node 20 or newer and Chrome (the address of chrome.exe is in the variable CHROME when it is not at its usual place).
GitHub does not read this file from the repository: upload it in the Settings of the repository, General, Social preview.
```

### assets/tools/sprites.mjs

```
Makes the sprites of the main website: one file with many images, so a page asks for one file and not for one for every image (RULES.md, Images).
  assets/images/splash.webp   the images of the splash screen (data.js, "splash", "images"), the whole file is a square of 768 px (four images of 384 px in a grid of 2 x 2)
  assets/images/icons.webp     the icons of all the apps of the directory (data.js, "projects"), in two blocks side by side: the pixel icons (16 px or less, as they are, in cells of 16 px)
                              and the icons of other makers (ArtCraft, TraceDraw: made smaller, 48 px at most, smoothly, in cells of 48 px). Each block is a grid as square as it can be.
The favicon.png of each app stays: it is the favicon of its app. The splash has no single files: its images are in the sprite, and their originals (<name>_raw) are the source.
It also writes in data.js what app.js needs to cut the sprites ("splash.sprite" and "iconSprite"), so run it again when an image or an app is added.
  node assets/tools/sprites.mjs            both
  node assets/tools/sprites.mjs icons      only the icons
  node assets/tools/sprites.mjs splash     only the splash (it needs the originals: assets/images/<name>_raw.png or .jpg, which are not kept in the repository)
The pictures are made by Chrome (a page of this script, with a canvas), so it needs Node 20 or newer and Chrome (the variable CHROME has the address of chrome.exe
when it is not at its usual place). Nothing is installed.
```

### assets/data/data.js

```
The shared data of the apps: what the files of assets/js read (the brand, the texts of the popups and of the kit, the sign-in, and the Appearance page). Every part is a named export.
```

### assets/icons/icons.js

```
The icons of the apps, in one file: the name of an icon (the name of its old file) and its SVG. assets/js/shared.js makes a variable of each, --icon-<name> (a data address of the SVG), on :root,
and the CSS uses the variable as the mask of an icon: mask: var(--icon-search) center / contain no-repeat. The colour of an icon is the colour of the text (currentColor).
```
