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
- Two pages, About and Terms and conditions, with their buttons in the footer of the main website. Their texts are in the main data.json ("pages"), in the three languages, and the page that is open is in the address (?page=terms).
- A splash screen: when the main website opens, a layer with the logo, the name, and three images (they slide every few seconds, in order) shows until a click or a key; it can be turned off in the Appearance page of the account app.
- Effects, set in the Appearance page of the account app and shared by every app (except muOS and ArtCraft): today a noise (a fine grain over the page, with an amount and an option to make it move) and a monochrome (the colour taken out, with an amount). An effect is only a layer over the page: a div of its own in the body, which takes no click and changes no element of the page (no style or attribute on any other element), and the noise stays still when the device asks for less motion.

## Projects

| Project | What it is | Location |
|---|---|---|
| muOS | A complete desktop that runs in the browser | `muos/` |
| Drivemu | File storage that keeps its data in the user's own GitHub repository | `drivemu/` |
| Gallemu | A gallery of the images and videos in the user's Drive | `gallemu/` |
| Spotimu | A music player for the audio files in the user's Drive | `spotimu/` |
| muJS | Lessons that teach JavaScript, with an editor that runs the code in a sandbox and checks it with tests; the progress is kept on the user's account | `mujs/` |
| Lingomu | Short lessons that teach the words of a language (hearts, XP, daily goal, streak); the progress is kept on the user's account | `lingomu/` |
| Picmu | Removes the background of an image or a video, and upscales an image or a video (x2 and x4), with models that run on the graphics card (WebGPU) | `picmu/` |
| Transmu | Translates text between eight languages with AI models that run in the browser (Opus-MT, NLLB-200, M2M100) | `transmu/` |
| Speechmu | Turns speech into text (Whisper: tiny, base, small) and text into speech (MMS voices and the voices of the device) with AI models that run in the browser; eight languages | `speechmu/` |
| Youmu | The sign-in, the profile, and the settings of every app | `youmu/` |
| Assetmu | Shows every asset of the apps: colours (they follow the theme), the colour and icon of each app, icons, fonts, sizes, and files | `assetmu/` |
| Kitmu | The UI kit of the apps: the templates, the helpers, and the popups, each with the code to copy and a way to try it | `kitmu/` |
| muAI | AI models that run directly in the browser | `muai/` |
| ArtCraft | Seven creative and productivity apps: DeckCraft, EffectCraft, FilmCraft, GridCraft, PhotoCraft, VectorCraft, WordCraft | `artcraft/<name>/` |

The directory also lists TraceDraw, an open source vector editor from another publisher. TraceDraw is an outside site, so it is only linked.

## Folder structure

```
index.html       Page skeleton
layout.css       Layout and styles specific to this page
app.js        Logic: list rendering, filters, tabs, language, theme
data.json        All data: projects, categories, languages, and interface text
assets/          Shared assets, in folders
  css/           The styles
    style.css       Shared styles (fonts, colour tokens, reset, input and select), used by every app except muOS
    components.css  The components every app makes again: icons, buttons, the search box, the alert, the card, the chat parts and the rest (shown in Kitmu)
    page.css        The page: the header, the footer, the main, and the sidebar with its drawer
  js/            The scripts
    theme.js        Applies the saved theme, and the effects of the Appearance page (the noise), before the page shows, to avoid a flash
    cleanup.js      Deletes what older versions of the code left in the browser (keys of localStorage, databases, caches that are listed in it; nothing else, because muOS and ArtCraft share the origin)
    i18n.js         Loads an app's data.json and applies the chosen language (en-US, zh-CN, ar-SA)
    account.js      The shared GitHub sign-in ("Sign in with GitHub"): get, signInWithGitHub, signOut, onChange, and the dialog (open, bind) that embeds /youmu
    settings.js     The settings of every app (get, set, onChange, listen): written by the account app and by the controls of an app
    storage.js      The shared data storage: one private repository (<id>-data), made empty and without a README (its first commit is the empty file AppData/.gitkeep), on its default branch: the Drive of Drivemu is the root, shown like a file explorer (Documents, Images, Videos, Audio, and AppData with them), and every app has its data folder in AppData (AppData/muai, AppData/lingomu); muAI keeps conversations/ and files/ in its folder
    transfer.js     Files of the Drive dragged out of an app: images as real images (any app takes them), other files as a link (the apps of Kancamu take them)
    url.js          Keeps what is on the screen of an app in the address (the query string: urlState.get, urlState.set), so a reload shows the same; an app in a tab tells the directory, which keeps it in its own address
    popup.js        The shared popups: the question and message dialog (popups.ask, popups.tell) and the toasts (popups.toast); every notice of every app (work that goes on, a result, an error) is a toast, and the status line of the footer only keeps the hint of the page; the button texts are in popup.json. No app uses alert, confirm, or prompt
    components.js   The helpers of the components (element, icon, formatSize, menu, popover, calendar, dataTable, questionnaire, and more)
    autocomplete.js The autocomplete of every search input (autocomplete.attach)
  data/          What the scripts read
    brand.json      The id, the name, and the highlighted word of the brand, the one place they are written (texts say {brand} and {highlight})
    popup.json      The texts of the buttons of the popups, in every language
    appearance.json The Appearance page of the account app: the splash screen and the effects (noise, monochrome, their amounts, and the movement of the noise) with their defaults and texts
    auth.json       The sign-in with GitHub: the client id (public), the scope, and the address of the Worker (local and production). Never a secret
  fonts/         Inter (woff2), used by every app, and JetBrains Mono (woff2), used by muOS
  images/        The images that are content of the site (the splash screen): WebP, compressed, with the original beside each as <name>_raw
  icons/         Every SVG icon of the main site, Drivemu, and muAI (universal names)
favicon.png      Site icon
preview.png      Open Graph image (1200x630): a screenshot of the directory, update it when the page changes a lot
RULES.md         Project rules
assetmu/         Assetmu: shows every asset (colours, icons, fonts, sizes, files) and the colour and icon of each app
kitmu/          Kitmu: the UI kit (templates of assets/css/components.css, helpers of assets/js/components.js, popups of assets/js/popup.js)
speechmu/       Speech to text (Transformers.js, Whisper; a file or the microphone; saved as text or SRT subtitles) and text to speech (MMS voices that download once, and the voices of the device; saved as WAV); nothing is uploaded
youmu/       The account app, shown in a dialog by every other app; the query string picks the page: ?page=login, ?page=profile, ?page=settings&app=<app>. All settings of all apps (language, theme, and the settings, models, and data of each app) are set here
artcraft/        The eight ArtCraft apps (downloaded by update.ps1)
drivemu/         File storage on GitHub
gallemu/        Gallery of the images and videos of the Drive (reads the Drive, read only)
spotimu/        Music player for the audio files of the Drive (reads the Drive, read only)
mujs/           JavaScript lessons (units, lessons and tests are in data.json; the code runs in a sandboxed frame, sandbox.js; the progress is in the mujs folder)
lingomu/        Language lessons (courses, units and lessons are in data.json; the progress is in the lingomu folder)
picmu/          Images and videos in the browser (WebGPU, nothing is uploaded), two tools in tabs: remove the background (RMBG 1.4, BiRefNet lite, MODNet) and upscale (Swin2SR, x2 and x4, a tile at a time); images and videos (frame by frame, saved as WebM, MP4, GIF or a ZIP of PNG frames; a removed background is transparent, white, black or any colour); can take a file from the Drive and save the result to it; every tool has its own model, chosen in the page or in the account app
transmu/        Translator in the browser (Transformers.js; Opus-MT, NLLB-200 or M2M100, chosen in a select; nothing is uploaded); Opus-MT uses English as the bridge between two other languages
muai/            AI in the browser
muos/            Desktop in the browser
CNAME            The kancamu.site domain for GitHub Pages
```

Each project is a plain folder with its own `index.html`. Its link in `data.json` is a relative path.

Styles are split in two. `assets/css/style.css` is loaded by every app except muOS and holds fonts, colour and theme tokens, the reset, and the basics of `input` and `select`. Each app then loads its own `layout.css` (`layout.css`, `drivemu/layout.css`, `muai/layout.css`) for its layout and specific components. Load order: `assets/css/style.css` first, then `layout.css`.

Colours have two layers in `assets/css/style.css`. The first is a palette of six colours named after the colour itself: `--black` and `--white` for backgrounds and text, and `--red`, `--yellow`, `--blue`, and `--green` for highlights; there is no gray in the palette. The second is roles (`--bg`, `--bg-1`, `--border`, `--fg`, `--danger`, `--ok`, ...), which are derived from the palette with `color-mix` and change between the dark and light theme. Each theme has two grays, mixes of white and black: `--neutral` for secondary text, and `--neutral-soft` for lines and the second background. Components use role names, or colour names for colours that never change.

In `data.json`, a project's highlight colour (`"color"`) is a palette name such as `"blue"` for projects made here. Projects from other publishers (ArtCraft, TraceDraw) may keep their own colour as hex, for example `"#a78bfa"`.

Every app has four basic files: `index.html`, `layout.css`, `app.js`, and `data.json`. The main site, Drivemu, and muAI each keep them in their own folder. They all load `assets/js/theme.js` first, and `assets/js/i18n.js` before their own script.

Every app supports English, Chinese, and Arabic (right to left). All its texts live in its own `data.json` (`ui`, one entry per language) and are marked in the HTML with `data-i18n`, `data-i18n-html`, `data-i18n-title`, `data-i18n-placeholder`, or `data-i18n-label`. A `<select class="language">` lets the user choose, and the choice is kept under the same key (`lang`) for every app. CSS uses logical properties (`inline-start`, `inline-end`) so the layout flips for Arabic. muOS has its own language files, and ArtCraft is a third-party app.

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
  "categories": ["tools"],
  "alternatives": ["Microsoft Word", "Google Docs"]
}
```

- `id` is unique and used in the URL.
- `name` and `description` are written per language. A missing language falls back to `en-US`.
- `highlight` is the part of the name shown in bold on the card, for example `mu` in "muOS".
- `color` is a palette name (`red`, `yellow`, `blue`, or `green`), or a hex value for a project from another publisher.
- `categories` must use keys that exist under `categories` in `data.json`: `ai`, `tools`, `productivity`, `system`, `office`, `design`, `video`, `creative`, `directory`, `storage`.
- `source` (only for a project of another maker) is the address of its source on GitHub: it is the "Source on GitHub" item in the menu of the three dots of its card. The projects of Kancamu have none.
- `alternatives` lists the products the project is an alternative to (one or more, product names are not translated; `[]` for none). The directory has a filter for them, and the search also finds them.
- New interface text and new category names are written in all three languages.

## Hosting

The site is static and can be served by any static web server, at the root of a domain or under a sub-path, because every link is relative. Serve the whole folder.

## Rules

The rules for language, HTML, CSS, colours, and file layout are in [RULES.md](RULES.md): the written language, the supported languages, the popups (every notice is a toast), the address (what is on the screen is in the query string), the words, the page layout, the templates, and the storage.
