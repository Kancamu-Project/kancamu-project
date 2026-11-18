# RULES

Applies to the main website, Drivemu, muAI, and any new web in Kancamu Project.
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

## CSS

#### 1. Units
Where you would normally use px, use rem instead.
Rem values are multiples of 0.2rem, such as 0.2rem, 0.4rem, 0.6rem, and so on.
1px, 2px, and 0.1rem are also allowed.
Do not use em.
1rem = 16px.

#### 2. Height
Set the height of an element, except text elements and elements whose height can change.
Buttons, inputs, and similar elements default to 2.4rem.
When the height is set, padding may only be on the x axis (left and right), not on the y axis (top and bottom).
When the height of an area (a header, a bar, a dialog head, and so on) is close to that default, make it exactly 2.4rem, and make the buttons, inputs, and selects inside it fill that height (height 100%), so they fit the area with no gap.

#### 3. Variables
When a variable can be used by more than one element, give it a universal name.

#### 4. Spacing
Use padding and gap for spacing, not margin.

#### 5. File Split
assets/style.css is shared by every web. It holds fonts, colours, the theme, the reset, and the basics of input and select.
Each web's layout.css only holds the layout and the components of that web.
Load assets/style.css first, then layout.css.
Do not repeat in layout.css what assets/style.css already has.

#### 6. Colours
Every project name has a highlighted part (the "mu" of Kancamu, Drivemu, muAI, and muOS; the data.json "highlight" field of a project), and the web of that project shows its own name that way too, in the colour of the project.
There are seven colours in assets/style.css, named after the colour itself in English.
Black (not truly black, just dark), gray, and white for backgrounds and borders.
Red, yellow (the more orange one), blue, and green for highlights.
Other colours are derived from these seven with color-mix, so do not write new hex codes.
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

#### 10. Buttons, Inputs and Selects
The default look is the background of the page with a gray border, and a gray background on hover. This is set once in assets/style.css.
A button that holds only an icon, with no text, is a perfect square: give it the class square, so its width follows its height. Never set a width on it; set the height (or let it fill its area) and the width follows. Every web is checked against this, also buttons made by script.
Do not make a button, input, or select borderless. A variant (primary, danger, and so on) may have its own colours.

## Other

#### 1. Structure
/favicon.png - the web's icon, leave it to me.
/assets - holds what is shared.
/assets/style.css - shared styles.
/assets/theme.js - applies the saved theme before the page shows.
/assets/i18n.js - loads data.json, applies the chosen language, and follows changes from other webs.
/assets/account.js - the shared GitHub sign-in (get, signIn, signOut, onChange, open, bind).
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

#### 5. ArtCraft
Never edit the files inside /artcraft/<app>: they are the official builds and are replaced on every update.
Run artcraft/update.ps1 to update them: it downloads the latest official web zip of each app from GitHub, checks it, and records the version in artcraft/data.json.
The colour, tagline, and translations of each app are kept in the main data.json.

#### 6. Folder Names
A folder that holds many files of the same kind uses the plural form, such as assets, fonts, and icons.

# NOTE
Currently, only humans are permitted to modify this file.
