# RULES

Applies to the main website, Drivemu, muAI, and any new web in Kancamu.
muOS has its own visual design and ArtCraft comes from a third party, so neither is bound by the visual rules here, nor by the file rules (HTML 5) and the language files (General 2).
muOS still follows the shared language and theme (see General 3).

## General

#### 1. Written Language
Everything is written in English: code, identifiers, comments, file and folder names, commit messages, and documentation such as README and RULES.
What users see is translated through the language files (en-US is the base language and the fallback), and translations into other languages are welcome.
Text that comes from a third party is the only exception.

#### 2. Supported Languages
Every web supports at least three languages: English (en-US), Chinese (zh-CN), and Arabic (ar-SA, right to left), like the main website.
Every text the user sees lives in the web's data.json, with one entry per language, so every web has at least a data.json.
assets/i18n.js loads it, picks the language, and applies it. The chosen language is stored in localStorage under the key "lang", so every web behaves the same.
Use logical CSS properties (inline-start, inline-end, padding-inline, and so on) instead of left and right, so the layout flips for Arabic.
muOS keeps its own language files in its languages folder, and ArtCraft is a third-party app, so both are exempt.

#### 3. Shared Language and Theme
The language ("lang") and the theme ("theme") are stored in localStorage under those keys and shared by every web, because all webs run on one origin.
A change in one web is followed live by every other open web through the "storage" event: assets/i18n.js and assets/theme.js do it for the normal webs, and muOS does it through system/core/sync.js.
Only the main website has the language and theme controls in its header. Every other web puts them inside its settings, and a page that has no settings yet (such as a login page) may show the language select.
A new web gets this for free by loading the two shared scripts. Do not store the language or the theme under another key.
muOS also has the theme "system" (follows the device), which stays inside muOS; only light and dark are shared.

#### 4. First Page
Every web opens straight onto its main content, with no landing, intro, or sign-in page in front: the main website shows the project list, muAI the chat, Drivemu the files page.
What needs something first (a sign-in, a model download) asks for it in place, when the user does it: Drivemu shows its empty files page with a Sign in button, and muAI loads its model when the first message is sent.
#### 5. Reset
Every app that keeps data has a reset button, in its settings, that returns the app to its first state: Drivemu deletes every file and folder and creates the default folders again, muAI deletes the chats and puts its settings back (Delete all, and Reset).
A reset cannot be undone, so it asks first and says what it deletes.

#### 6. Copyright
Every web shows "© Kancamu" somewhere on its pages: the main website and muAI in their footer, Drivemu at the end of its status bar, the account web at the bottom, and muOS in Settings > About.
It is written as it is, with normal capitals, and never turned into all capitals with text-transform. The text comes from the "copyright" key of the web's data.json (for muOS, from system/config/osinfo.js).

#### 7. Brand Name
The name of the brand and its highlighted word (the "mu") are written in one place, assets/brand.json, and nowhere else.
A text that needs them says {brand} or {highlight} in the web's data.json (the name of the site, a publisher, a copyright, a sentence, a project name such as Drive{highlight}, the "highlight" of a project), and assets/i18n.js fills them in. A logo that shows the highlighted word is a "logo" text in data.json with a span of class highlight. Code that needs them reads i18n.brand.name and i18n.brand.highlight. muOS reads the same file for the name (system/core/osinfo.js, brandName).
To rebrand, change "name" and "highlight" in assets/brand.json (and the "id" if the repository should be renamed). The domain (CNAME), the muOS name, and names written in code (such as the system prompt of muAI) are separate.

#### 8. Text Selection
Text cannot be selected by default (assets/style.css sets user-select: none on everything).
Only an input, a textarea, and an area with the class "selectable" allow it: a chat message, the text of a file in a preview, the details of an account, and the like. Add the class to an area only when the user has a reason to copy from it.

#### 9. Keyboard
Every web can be used without a mouse.
Use real buttons, links, and inputs. If something else has to be clickable, give it tabindex="0" and make Enter (and Space, where it selects) do what the click does.
Keyboard focus is always visible: assets/style.css draws a 2px blue outline, a little outside the element, on :focus-visible, so a web must not remove it.
A control that appears on hover must also appear on focus (:focus-within).
A menu opens with focus on its first item, moves with the arrow keys, and closes with Escape, giving the focus back to the button that opened it. A dialog takes the focus when it opens, closes with Escape, and gives the focus back.

#### 10. Data
Data is never written in the code. A list, a table, or a setting that describes something and that you could change without changing how the web works, such as the list of AI models, the projects, the default folders, the default settings, the file types and their icons, belongs in data.json. script.js reads it, and layout.css and index.html do not repeat it.
The code holds only what the web does. When a new item is added to a list, only data.json changes.
Every text that a person reads is in data.json too, in the supported languages (see Written Language).

#### 11. Questions and Messages
A web never uses alert, confirm, prompt, or any other box of the browser (a window.open popup for a message, a beforeunload question, and the like). They look different on every browser, cannot be styled, cannot be translated by us, and block the page.
Every web asks and tells through the shared dialog, assets/dialog.js (loaded after assets/i18n.js), which draws the question in the page itself, in the style of the web, and in the language of the page:
- await dialogs.ask({ text, title, ok, cancel }) gives true or false.
- await dialogs.ask({ text, value }) asks for a text, starting from value, and gives the text, or null when the user cancels.
- await dialogs.tell({ text, ok }) shows a message with one button.
The texts of its two default buttons (OK and Cancel) are in assets/dialog.json, in every supported language. A web that needs other button texts passes them in ok and cancel, taken from its own data.json.
The dialog has focus on its first control, closes with Escape, and Enter confirms. A web does not draw a question dialog of its own. A short message that needs no answer is a toast, not a dialog.

#### 12. Search
Every search input of every web has autocomplete: while the user types, the names that the search can find show in a list under the input (the names of the projects, the files of the open folder, the titles of the chats). A web gets it from the shared assets/autocomplete.js, loaded after assets/i18n.js:
autocomplete.attach(input, { suggestions: () => [the names to offer] })
The list is drawn by the page itself, like the dialogs, not by the datalist of the browser. The arrow keys move through it, Enter picks the marked name, and Escape closes it. A picked name is put in the input with an "input" event, so the search runs as if it was typed. A web does not build an autocomplete of its own.

## HTML

#### 1. Container
Where you would normally use header, main, footer, and similar elements, use a div instead.
A div that wraps more than one element must use display flex or grid.

#### 2. Text Element
Where you would normally use a p element, use a span instead.

#### 3. Image
Where you would normally use an img element, use a div with a CSS background that points to the image.

#### 4. Button
Not <button>Button</button>, but <button><span>Button</span></button>.
The text stays inside a text element.
This makes it possible to add an icon element inside the button.

#### 5. Files
Every web has at least four files: index.html, layout.css, script.js, and data.json.
Do not put CSS or JavaScript inside the HTML.
If a name differs, make it the same.

#### 6. No Pointless Wrappers
Do not wrap a single element in another element of exactly the same size, such as a div that holds only one child that fills it.
Give the element the styles itself. A wrapper is only for something the element cannot do alone: grouping more than one element, positioning, scrolling, or a different size, background, or border.

#### 7. Names
An id and a class say what the element is or does, in full words. A longer name is fine; a name that needs a guess is not.
Not .t, .acts, .sz, .grp, #el, but .chat-title, .chat-actions, .model-size, .date-group, #model-picker.
No abbreviations, no one-letter names, no names that only describe the look (.big, .red, .left). Name the role: .primary, .danger, .on, not .blue.
Write names in lowercase with hyphens, and give a part of a component the name of the component first: .project-name, .project-description.
An icon element is the class icon plus icon-<name>, as in icon icon-trash. A file kind is kind-<name>.
An id is written with hyphens (#new-chat-button); a script may keep its elements under the camelCase form of the id (els.newChatButton).
When a name is renamed, rename it everywhere: index.html, layout.css, script.js.

## CSS

#### 1. Units
Only assets/style.css writes a length unit (rem, px, vh, vw). A layout.css writes none:
a size is calc(var(--unit) * n), where --unit is 0.2rem (so a size is a multiple of 0.2rem, and half a unit is * 0.5), or a variable of the scales (--height, --gap-*, --padding-*, --font-size-*, --border-radius-*);
a line is var(--border-width) (1px) or var(--border-width-thick) (2px);
a viewport length is calc(var(--vw) * n) or calc(var(--vh) * n).
Not covered: the breakpoints of @media (CSS cannot use a variable there, so they are written in rem), percentages, 0, times (s, ms), and angles.
In assets/style.css, use rem and not px, except for the lines. Do not use em. 1rem = 16px.

#### 2. Height
Set the height of an element, except text elements and elements whose height can change.
Buttons, inputs, and similar elements default to 2.4rem.
When the height is set, padding may only be on the x axis (left and right), not on the y axis (top and bottom).
When the height of an area (a header, a bar, a dialog head, and so on) is close to that default, make it exactly 2.4rem, and make the buttons, inputs, and selects inside it fill that height (height 100%), so they fit the area with no gap.

#### 3. Variables
When a variable can be used by more than one element, give it a universal name.

#### 4. Spacing
Use padding and gap for spacing, not margin.
The sizes come from scales, written once in assets/style.css. Each has a small, a medium, and a large step, and gap, padding, and font-size also have an extra-small and an extra-large step; add a step (extra-small or extra-large) when none of the others fits, never a size of your own:
border-radius: --border-radius-small 0.2rem, --border-radius-medium 0.3rem, --border-radius-large 0.4rem
gap: --gap-extra-small 0.2rem, --gap-small 0.4rem (the default, between the items of a row, a list, or a card), --gap-medium 0.8rem (between areas: the blocks of a page or of a dialog, as in the main website), --gap-large 1.2rem, --gap-extra-large 1.6rem
padding: --padding-extra-small 0.2rem, --padding-small 0.4rem, --padding-medium 0.8rem (the default at the start and end of a button, input, and select, set once in assets/style.css), --padding-large 1.2rem, --padding-extra-large 1.6rem
font-size: --font-size-extra-small 0.6rem (labels, hints, tags), --font-size-small 0.8rem (the text of the page), --font-size-medium 1rem, --font-size-large 1.2rem (names and headings), --font-size-extra-large 1.4rem
icon-size: --icon-size-extra-small 0.8rem, --icon-size-small 1rem (an icon in a button or a line of text), --icon-size-medium 1.2rem, --icon-size-large 1.6rem (the mark of a logo), --icon-size-extra-large 3.2rem (the icon of a project, a big icon)
A web uses these variables, or 0 where elements must touch. Do not write another size where one of them fits.
A button that holds only an icon has no padding: give it the class square and its width equals its height (var(--height)), so it is a perfect square. A bar that holds such buttons uses box-sizing: content-box, so its border does not make the buttons shorter than they are wide.

#### 5. File Split
assets/style.css is shared by every web. It holds fonts, colours, the theme, the reset, and the basics of input and select.
Each web's layout.css only holds the layout and the components of that web.
Load assets/style.css first, then layout.css.
Do not repeat in layout.css what assets/style.css already has.

#### 6. Colours
Every project name has a highlighted part (the "mu" of Kancamu, Drivemu, muAI, and muOS; the data.json "highlight" field of a project), and the web of that project shows its own name that way too, in the colour of the project.
There are six main colours in assets/style.css, named after the colour itself in English.
Black (not truly black, just dark) and white for backgrounds and text.
Red, yellow (the more orange one), blue, and green for highlights.
There is no gray in the palette. Each theme has two grays, both mixes of white and black made with color-mix: --neutral for secondary text, and --neutral-soft for lines and the second background. They are the only grays.
Every other colour is derived from the six with color-mix too, so do not write new hex codes.
Components use role names (bg, fg, border, danger, and so on), which change with the dark and light theme.
Colours that come from a third party, such as an app's own brand colour, may be used as they are.

#### 7. Theme
Dark is the default, and light is set with data-theme="light" on html.
The chosen theme is stored in localStorage under the key "theme" and applied by assets/theme.js, so every web behaves the same.
See General 3 for how a change is shared with the other webs.

#### 8. Image Rendering
Images that belong to the interface (icons, logos, the favicon) use image-rendering: pixelated, so small pixel art stays sharp when scaled.
Images that show what the user brought (photos, previews, uploads) do not.
Images are CSS backgrounds (see HTML rule 3), so the rule is set on the element that has the background.
An img element is tolerated only for content from the user's own data (avatars, thumbnails, previews).

#### 9. Single Line
An area made for one line of text must never wrap: set white-space: nowrap, overflow: hidden, and text-overflow: ellipsis on the text, and min-width: 0 when it sits in a flex row, so it shortens instead of breaking.

#### 10. Capitals
A long text, such as a sentence, a description, a hint, or a message, is never all capitals: write it in normal case and do not use text-transform: uppercase on it.
Only short labels may be all capitals, such as a button, a tab, a tag, or a heading of one or two words.

#### 11. Line Width
Every line is var(--border-width) (1px): borders, outlines, and the shadow lines that stand in for a border (such as the line under the active tab). The exceptions are the keyboard focus outline, the coloured line of the active tab and of a hovered project, and the line at the start of the active folder in the Drivemu sidebar, which are var(--border-width-thick) (2px) so they stand out.
Do not make a border thicker to stand out; use a colour instead.

#### 12. Border Style and Radius
Every border is solid: no dashed, dotted, or double border.
Corners: an element that stands alone is rounded with a --border-radius variable of assets/style.css: medium for a button, an input, a select, a textarea, small for a tag or a thumbnail, large for a dialog, a menu, a toast.
An element that touches another one is square, with border-radius: 0 set by its web: a bar and what is in it, a group of buttons (such as the view switch), tabs, the rows of a table, a grid of cells, such as the project cards of the main website. Checkboxes, radios, and ranges are square.
Do not write another radius. This is a trial: change the variables, or the list of square elements, to change the look.

#### 13. Buttons, Inputs and Selects
The default look has no colour of its own: the text colour and the background follow the parent, with a gray border, and a gray background on hover. This is set once in assets/style.css.
A button that holds only an icon, with no text, is a perfect square: give it the class square, which gives it no padding and a width equal to its height (see Spacing). Every web is checked against this, also buttons made by script.
Do not make a button, input, or select borderless. A variant (primary, danger, and so on) may have its own colours.

## Other

#### 1. Structure
/favicon.png - the web's icon, leave it to me.
/assets - holds what is shared.
/assets/style.css - shared styles.
/assets/theme.js - applies the saved theme before the page shows.
/assets/i18n.js - loads data.json, applies the chosen language, and follows changes from other webs.
/assets/account.js - the shared GitHub sign-in (get, signIn, signOut, onChange, open, bind).
/assets/storage.js - the shared data storage: one repository, one branch per app (connect, readFile, writeFile).
/assets/brand.json - the id, the name, and the highlighted word of the brand.
/assets/icons - holds every svg icon for the GUI, do not use emoji.
/assets/fonts - holds the fonts.
Each web has its own folder in the root with index.html, layout.css, script.js, and data.json (the root itself is the main website).
/account - the account web: sign in and sign out, embedded by every other web in a dialog.
/muos - the web OS, with its own design, languages, tests, and file index (run npm run index in it after adding or removing files).
/artcraft - the official web builds of the ArtCraft apps, one folder per app, with data.json (the installed versions) and update.ps1.

#### 2. Icons
All icons live in /assets/icons and are shared, so no web has its own icons folder.
Names are universal (close, plus, trash), not specific to one web.
When two icons are the same but look different, keep the one that is better looking and fits shared use.
Icons are used as CSS masks and their colour is currentColor.

#### 3. Fonts
Every web uses the fonts in /assets/fonts. Do not load fonts from outside and do not keep fonts in a web's own folder.

#### 4. Shared Sign-in
The GitHub sign-in is the account web (/account). No other web builds its own sign-in screen, login form, or profile panel.
The account is kept in localStorage under the key "account" ({ token, login, name, avatar }) and handled only by assets/account.js.
A web adds a profile button (an icon-only square button with the class "account", right after its theme button or its settings button) and calls account.bind(button): it opens the account web in a dialog and shows the avatar once signed in.
A web that needs GitHub reads account.get() and listens to account.onChange(); when there is no account it asks the user to sign in with account.open().
For now only a personal access token (classic) is accepted.

#### 5. Data Storage
The data of a user is kept in one private GitHub repository named after the brand: <id>-data, with the "id" of assets/brand.json (today kancamu-data), in the account of the signed-in user.
Every app keeps its data on its own branch, named after the app: Drivemu on drivemu, muAI on muai, and so on. An app only reads and writes its own branch, never another one, and never the default branch.
Drivemu uses the root of its branch as the root of the drive. A new drive starts with the folders Documents, Images, Videos, and Audio (each kept by an empty .gitkeep), and the sidebar lists the folders at the root.
muAI keeps a chat per file in conversations/<id>.json, loaded when the chat is opened, and the files attached to chats in files/<sha256>, named by the hash of their content, so a file is stored once whatever chat it was attached in.
A web gets its branch from assets/storage.js: storage.connect("<app>") creates the repository and the branch when they are not there yet, and storage.readFile, storage.writeFile, storage.list, storage.readBinary, storage.writeBinary, and storage.removeFile work with its files. It does not build its own repository name.

#### 6. ArtCraft
Never edit the files inside /artcraft/<app>: they are the official builds and are replaced on every update.
Run artcraft/update.ps1 to update them: it downloads the latest official web zip of each app from GitHub, checks it, and records the version in artcraft/data.json.
The colour, tagline, and translations of each app are kept in the main data.json.

#### 7. Folder Names
A folder that holds many files of the same kind uses the plural form, such as assets, fonts, and icons.

# NOTE
Currently, only humans are permitted to modify this file.
