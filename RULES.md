# RULES

Applies to the main website, Drivemu, muAI, and any new app in Kancamu.
muOS has its own visual design and ArtCraft comes from a third party, so neither is bound by the visual rules here, nor by the file rules (HTML 5) and the language files (General 2).
muOS still follows the shared language and theme (see General 3).

## General

#### 1. Written Language
Everything is written in English: code, identifiers, comments, file and folder names, commit messages, and documentation such as README and RULES.
What users see is translated through the language files (en-US is the base language and the fallback), and translations into other languages are welcome.
Text that comes from a third party is the only exception.

#### 2. Supported Languages
Every app supports at least three languages: English (en-US), Chinese (zh-CN), and Arabic (ar-SA, right to left), like the main website.
Every text the user sees lives in the app's data.js, with one entry per language, so every app has at least a data.js.
assets/js/i18n.js loads it, picks the language, and applies it. The chosen language is stored in localStorage under the key "lang", so every app behaves the same.
Use logical CSS properties (inline-start, inline-end, padding-inline, and so on) instead of left and right, so the layout flips for Arabic.
muOS keeps its own language files in its languages folder, and ArtCraft is a third-party app, so both are exempt.

#### 3. Shared Language and Theme
The language ("lang") and the theme ("theme") are stored in localStorage under those keys and shared by every app, because all apps run on one origin.
A change in one app is followed live by every other open app through the "storage" event: assets/js/i18n.js and assets/js/theme.js do it for the normal apps, and muOS does it through system/core/sync.js.
Only the main website and the account app have the language and theme controls, in their header (the theme is one button that toggles it). Assetmu and Kitmu have the theme button too, because they show the colours and the components in both themes. In every other app they are set in the account app (see Other 4), and an app has no language or theme control of its own.
A new app gets this for free by loading the two shared scripts. Do not store the language or the theme under another key.
muOS also has the theme "system" (follows the device), which stays inside muOS; only light and dark are shared.
The effects (today the noise) are shared the same way, and belong to no app: they are the settings "appearance" (localStorage "appearance.settings", set in the Appearance page of the account app, whose fields are in assets/data/appearance.js), applied by assets/js/theme.js (a div of the effect, class effect, added directly in the body, and taken away when the effect is turned off) and drawn by assets/css/style.css, so every app that loads the shared files has them, and an app has no effect of its own. An effect is only a layer: one div of its own (class effect), added directly in the body (never in the header, the main, the sidebar, the footer, or any other element), fixed over the page, that takes no click. An effect never changes another element: no attribute and no style is written on html, body, or any element of the page (no filter, transform, opacity, or colour on them, and no variable on html), and no rule of the page is changed, because that would change the elements under it, their fixed children, and the popups. A colour effect filters what is behind its layer (backdrop-filter). An effect does not hide what is under it, and does not move when the device asks for less motion (prefers-reduced-motion). A new effect is a field of assets/data/appearance.js, a layer that theme.js adds to the body, and its rule in assets/css/style.css; muOS and ArtCraft do not have them. An app in a tab of the main website adds no layer of its own, because the layers of the main website already cover its frame (a layer twice would make the noise twice as strong); an app in a dialog (the account app) has its own, because the dialog is over the layers. Today: the noise, and the monochrome.

#### 4. First Page
Every app opens straight onto its main content, with no landing, intro, or sign-in page in front: the main website shows the project list, muAI the chat, Drivemu the files page.
What needs something first (a sign-in, a model download) asks for it in place, when the user does it: Drivemu shows its empty files page with a Sign in button, and muAI loads a model when the user chooses one.
The one exception is the splash screen of the main website: a layer (#splash, directly in the body) over the page when the site opens, with the logo, the name, an image, and the copyright, like the start picture of a desktop app. The images are the list "splash" of the main data.js (each with its author and the address of its source, and the name of the author of the image that shows is on the splash and in the page About): they slide one after another every few seconds, in the order of the list (they stay still when the device asks for less motion). It is not a page in front of the content: the content is loaded behind it, it stays until the user clicks or presses a key (it never closes by itself), and the user can turn it off in the Appearance page of the account app (the setting "splash"). Only the main website has one, and no app asks for anything in it.
#### 5. Reset
Every app that keeps data has a reset, in its section of the settings of the account app (see Other 8), that returns the app to its first state: Drivemu deletes every file and folder and creates the default folders again, muAI deletes the chats and puts its settings back (Delete all, and Restore the defaults).
A reset cannot be undone, so it asks first and says what it deletes.

#### 6. Copyright
Every app shows "© Kancamu" somewhere on its pages: the main website in its footer, muAI and the account app at the bottom of their sidebar (with a line above it), Drivemu at the end of its status bar, and muOS in Settings > About.
It is written as it is, with normal capitals, and never turned into all capitals with text-transform. The text comes from the "copyright" key of the app's data.js (for muOS, from system/config/osinfo.js).

#### 7. Brand Name
The name of the brand and its highlighted word (the "mu") are written in one place, assets/data/brand.js, and nowhere else.
A text that needs them says {brand} or {highlight} in the app's data.js (the name of the site, a publisher, a copyright, a sentence, a project name such as Drive{highlight}, the "highlight" of a project), and assets/js/i18n.js fills them in. A logo that shows the highlighted word is a "logo" text in data.js with a span of class highlight. Code that needs them reads i18n.brand.name and i18n.brand.highlight. muOS reads the same file for the name (system/core/osinfo.js, brandName).
To rebrand, change "name" and "highlight" in assets/data/brand.js (and the "id" if the repository should be renamed). The domain (CNAME), the muOS name, and names written in code (such as the system prompt of muAI) are separate.

#### 8. Text Selection
Text cannot be selected by default (assets/css/style.css sets user-select: none on everything).
Only an input, a textarea, and an area with the class "selectable" allow it: a chat message, the text of a file in a preview, the details of an account, and the like. Add the class to an area only when the user has a reason to copy from it.

#### 9. Keyboard
Every app can be used without a mouse.
Use real buttons, links, and inputs. If something else has to be clickable, give it tabindex="0" and make Enter (and Space, where it selects) do what the click does.
Keyboard focus is always visible: assets/css/style.css draws a 2px blue outline, a little outside the element, on :focus-visible, so an app must not remove it.
A control that appears on hover must also appear on focus (:focus-within).
A menu opens with focus on its first item, moves with the arrow keys, and closes with Escape, giving the focus back to the button that opened it. A dialog takes the focus when it opens, closes with Escape, and gives the focus back.

#### 10. Data
Data is never written in the code. A list, a table, or a setting that describes something and that you could change without changing how the app works, such as the list of AI models, the projects, the default folders, the default settings, the file types and their icons, belongs in data.js. A data file is an ES module with one default export (`export default { ... }`), which assets/js/i18n.js loads with import(); app.js reads it, and layout.css and index.html do not repeat it.
The code holds only what the app does. When a new item is added to a list, only data.js changes.
Every text that a person reads is in data.js too, in the supported languages (see Written Language).

#### 11. Questions and Messages
An app never uses alert, confirm, prompt, or any other box of the browser (a window.open popup for a message, a beforeunload question, and the like). They look different on every browser, cannot be styled, cannot be translated by us, and block the page.
Every app asks and tells through the shared popups, assets/js/popup.js (loaded after assets/js/i18n.js), which draws the question in the page itself (in the #popups element, see Page Layout), in the style of the app, and in the language of the page:
- await popups.ask({ text, title, ok, cancel }) gives true or false.
- await popups.ask({ text, value }) asks for a text, starting from value, and gives the text, or null when the user cancels.
- await popups.tell({ text, ok }) shows a message with one button.
The texts of its two default buttons (OK and Cancel) are in assets/data/popup.js, in every supported language. An app that needs other button texts passes them in ok and cancel, taken from its own data.js.
The dialog has focus on its first control, closes with Escape, and Enter confirms. An app does not draw a question dialog of its own. A short message that needs no answer is a toast, not a dialog: popups.toast(text, { kind, duration, progress }), from the same file, shown at the bottom of the page with the same look in every app (kind is success, info, warning, or error). An app does not make a toast of its own either.
Every notice is a toast: the work that goes on (a download, a conversion, a save), a result ("Done", "Copied"), and an error. An app never writes a notice in the page itself (a line of text, a red text under a button, an alert box of its own). The work that goes on is one toast with duration 0, which changes its text with set and is closed when the work ends (in a finally, so it goes also when the work fails), with a bar (progress, 0 to 1) when it knows how far it is; a result and an error are new toasts. The status line of the footer (#status, components.status) only keeps what the page tells about itself, as a hint: what to do first, how many items there are, who is signed in.

#### 12. Search
Every search input of every app has autocomplete: while the user types, the names that the search can find show in a list under the input (the names of the projects, the files of the open folder, the titles of the chats). An app gets it from the shared assets/js/autocomplete.js, loaded after assets/js/i18n.js:
autocomplete.attach(input, { suggestions: () => [the names to offer] })
The list is drawn by the page itself, like the dialogs, not by the datalist of the browser. The arrow keys move through it, Enter picks the marked name, and Escape closes it. A picked name is put in the input with an "input" event, so the search runs as if it was typed. An app does not build an autocomplete of its own.

#### 13. Address
What the user sees on the screen is kept in the address of the page (its query string), so a reload shows the same: the open folder, the text of a search, the sort, the tab, the album, the lesson, the chat, the languages of a translation. An app reads the address when it starts and writes it when something changes, with urlState.get and urlState.set (assets/js/url.js, loaded after assets/js/cleanup.js). The first value is left out, so a fresh page has a clean address, and the history is not filled: the address is replaced, not added to.
The address wins over the settings: a setting is what the user prefers, the address is what is on the screen now. A name means the same in every app: q is a search, sort the order, path a folder, album an album, lesson a lesson. A text that the user typed goes in the address only when it is short (500 characters), and a file that was chosen never does.
An app in a tab of the main website does nothing more: urlState tells the main website its query string, the main website keeps it in its own address (s.<id>), and opens the app with it again when the page is reloaded. An app does not keep this in localStorage, and does not write history.pushState or history.replaceState itself.

#### 14. Words
One thing has one name in every app, in the texts, the code, and the documents. A still picture is an image (never a picture or a photo), a moving one is a video, a recording of sound is audio, and the image of an account is its avatar. Each of the pages of Kancamu that does a job of its own (Drivemu, muAI, Picmu, Youmu, and the rest) is an app, in every language, and never a "web" (a web page, a website: the main website is the website). "Web" stays only for the web itself and for what other makers call so (the web builds of ArtCraft, WebGPU, WebM). Before a word is chosen for something, look at what the other apps call it, and use that word; when a word is changed, change it everywhere (all the languages, data.js, layout.css, app.js, README, and these rules).

## HTML

#### 1. Container
Where you would normally use header, main, footer, and similar elements, use a div instead.
A div that wraps more than one element must use display flex or grid.

#### 2. Text Element
Where you would normally use a p element, use a span instead.

#### 3. Image
Where you would normally use an img element, use a div with a CSS background that points to the image.
Images that a page shows together are one file, a sprite, so the page asks for one file and not for one per image: the images of the splash screen of the main website are assets/images/splash.webp (one square of 768 px in all, four images of 384 px in a grid of 2 x 2) and the icons of all the apps of the directory, the apps of other makers too, are assets/images/icons.webp (the pixel icons of 16 px as they are, in cells of 16 px, and the icons of other makers made smaller, at most 48 px, in cells of 48 px, in two blocks of one file; every icon is shown with no smoothing, image-rendering: pixelated). assets/tools/sprites.mjs makes them from the single files (and from the originals, for the splash) and writes in data.js what app.js needs to cut them ("splash.sprite" and "iconSprite"); run it again when an image or an app is added. A box shows one square of the sprite with background-size and background-position in percentages (the box is a square too), and when a project is not in the sprite (a new app, or an icon that could not be loaded), or the sprite does not have all the images of the list, the single file is used. The single files stay: favicon.png is the favicon of its app, and the splash has no single files: its images are only in the sprite, and their originals (assets/images/<name>_raw) are the source that sprites.mjs reads.

#### 4. Button
Not <button>Button</button>, but <button><span>Button</span></button>.
The text stays inside a text element.
This makes it possible to add an icon element inside the button.

#### 5. Files
Every app has at least four files: index.html, layout.css, app.js, and data.js.
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
When a name is renamed, rename it everywhere: index.html, layout.css, app.js.

#### 8. Scripts
Every script is in the head, none is in the body. A script has defer (a script with type="module" is deferred already), so it is downloaded while the page is read and runs after the whole page is read, in the order it is written: the shared scripts of /assets first, then the app.js of the app last. A script then finds every element of the page, and does not wait for an event of the page to start.
The only script without defer is assets/js/theme.js, which comes first: it must run before the page is shown, so that the page does not flash in the wrong theme.

#### 9. Open Graph
Every app has the Open Graph tags (and the card of Twitter) in the head of its index.html, so a link to it shows a title, a text, and an image where it is shared: og:type, og:site_name, og:title, og:description, og:url, og:image (with its type, width, height, and alt), and twitter:card summary_large_image. The title and the description are the name and the description of the app in the main data.js, in English: the sites that read the tags do not run scripts, so these are the one text of an app that is in its index.html and not in its data.js (the page of the app is still in every language). The image is the preview.png of the folder of the app (1200 x 630), made from the card of the app, an element of the section Previews of Assetmu (its code in assetmu/app.js and its style in assetmu/layout.css, so the folder of the app keeps only its own files): the card is the one source of the previews, it can be saved as an image there (Save as image), and assets/tools/og-cards.mjs takes the picture of each card to make all the preview.png files at once. The card of the main website is its splash screen; when it changes, make it again and raise the number after "?v=" in og:image, so the sites that keep the old image in their cache ask for the new one. A new app gets its tags and its preview.png when it is made, like it gets its entry in the main data.js.

#### 10. Search engines
What a search engine reads is made by assets/tools/seo.mjs (node assets/tools/seo.mjs), from the main data.js, and it is made again when an app is added or its name or description changes: sitemap.xml and robots.txt at the root; and, in the index.html of the main website and of every app of the brand, between the markers <!-- seo --> and <!-- seo-body -->: the canonical address, the structured data (JSON-LD: Organization and WebSite on the main website, WebApplication on an app), and a <noscript> with the name, the description, the link to the main website (and to the apps, on the main website). The <title> is static too, in English: the name and the description of the app (the page still sets its own title in the language of the visitor). Do not write these parts by hand, and do not hide text from the visitors to show it to a search engine.

## CSS

#### 1. Units
Only assets/css/style.css writes a length unit (rem, px, vh, vw). A layout.css writes none:
a size is calc(var(--unit) * n), where --unit is 0.2rem (so a size is a multiple of 0.2rem, and half a unit is * 0.5), or a variable of the scales (--height, --gap-*, --padding-*, --font-size-*, --border-radius-*);
a line is var(--border-width) (1px) or var(--border-width-thick) (2px);
a viewport length is calc(var(--vw) * n) or calc(var(--vh) * n);
a length that is a share of the width of its container (a card of Assetmu, which has container-type: inline-size) is calc(var(--cqw) * n).
Not covered: the breakpoints of @media (CSS cannot use a variable there, so they are written in rem), percentages, 0, times (s, ms), and angles.
In assets/css/style.css, use rem and not px, except for the lines. Do not use em. 1rem = 16px.

#### 2. Height
Set the height of an element, except text elements and elements whose height can change.
Buttons, inputs, and similar elements default to 2.4rem.
When the height is set, padding may only be on the x axis (left and right), not on the y axis (top and bottom).
When the height of an area (a header, a bar, a dialog head, and so on) is close to that default, make it exactly 2.4rem, and make the buttons, inputs, and selects inside it fill that height (height 100%), so they fit the area with no gap.

#### 3. Variables
When a variable can be used by more than one element, give it a universal name.

#### 4. Spacing
Use padding and gap for spacing, not margin.
The sizes come from scales, written once in assets/css/style.css. Each has a small, a medium, and a large step, and gap, padding, and font-size also have an extra-small and an extra-large step; add a step (extra-small or extra-large) when none of the others fits, never a size of your own:
border-radius: --border-radius-small 0.2rem, --border-radius-medium 0.3rem, --border-radius-large 0.4rem, --border-radius-extra-large 0.8rem (the card of the splash screen)
gap: --gap-extra-small 0.2rem, --gap-small 0.4rem (the default, between the items of a row, a list, or a card), --gap-medium 0.8rem (between areas: the blocks of a page or of a dialog, as in the main website), --gap-large 1.2rem, --gap-extra-large 1.6rem
padding: --padding-extra-small 0.2rem, --padding-small 0.4rem, --padding-medium 0.8rem (the default at the start and end of a button, input, and select, set once in assets/css/style.css), --padding-large 1.2rem, --padding-extra-large 1.6rem
font-size: --font-size-extra-small 0.6rem (labels, hints, tags), --font-size-small 0.8rem (the text of the page), --font-size-medium 1rem, --font-size-large 1.2rem (names and headings), --font-size-extra-large 1.4rem
icon-size: --icon-size-extra-small 0.8rem, --icon-size-small 1rem (an icon in a button or a line of text), --icon-size-medium 1.2rem, --icon-size-large 1.6rem (the mark of a logo), --icon-size-extra-large 3.2rem (the icon of a project, a big icon)
sidebar-width: --sidebar-width 16rem (the width of the sidebar of every app: Drivemu, muAI, and the account app; an app writes no width of its own for a sidebar, and one that can be dragged, such as muAI, starts from it)
An app uses these variables, or 0 where elements must touch. Do not write another size where one of them fits.
A button that holds only an icon has no padding: give it the class square and its width equals its height (var(--height)), so it is a perfect square. A bar that holds such buttons uses box-sizing: content-box, so its border does not make the buttons shorter than they are wide.

#### 5. File Split
assets/css/style.css is shared by every app. It holds fonts, colours, the theme, the reset, the basics of input and select, the templates of the components, and the page.
Each app's layout.css only holds the layout and the components of that app.
Load assets/css/style.css first, then layout.css.
Do not repeat in layout.css what assets/css/style.css already has.

#### 6. Colours
Every project name has a highlighted part (the "mu" of Kancamu, Drivemu, muAI, and muOS; the data.js "highlight" field of a project), and the app of that project shows its own name that way too, in the colour of the project.
There are six main colours in assets/css/style.css, named after the colour itself in English.
Black (not truly black, just dark) and white for backgrounds and text.
Red, yellow (the more orange one), blue, and green for highlights. They are lighter in the dark theme and darker in the light theme, so the text on them is dark in the dark theme and white in the light theme.
There is no gray in the palette. Each theme has two grays, both mixes of white and black made with color-mix: --neutral for secondary text, and --neutral-soft for lines and the second background. They are the only grays.
Every other colour is derived from the six with color-mix too, so do not write new hex codes.
Components use role names (bg, fg, border, danger, and so on), which change with the dark and light theme.
The text on a fill follows one standard, in every theme: on a neutral fill it is the opposite role (--accent-ink on --accent, --bg on --fg); on red, yellow, blue, green, or danger it is --on-color (dark in the dark theme, white in the light theme); on the colour of an app (--brand) it is --brand-ink, which assets/js/i18n.js sets to white or dark by contrast (white when the contrast is 3 or more). A layout.css does not write --white or --black as the text on a colour.
Colours that come from a third party, such as an app's own brand colour, may be used as they are.
The brand colour of an app (the colour of its icon) is written once, as a hex, in a data.js: the "color" of its project in the main website (always a hex, never a colour of the palette: a project can come from outside, and it keeps its own colour in every theme), and "brandColor" in its own data.js, which its script sets as --brand. A layout.css uses var(--brand), never the hex.

#### 7. Theme
Dark is the default, and light is set with data-theme="light" on html.
The chosen theme is stored in localStorage under the key "theme" and applied by assets/js/theme.js, so every app behaves the same.
See General 3 for how a change is shared with the other apps.

#### 8. Image Rendering
Images that belong to the interface (icons, logos, the favicon) use image-rendering: pixelated, so small pixel art stays sharp when scaled.
Images that show what the user brought (previews, uploads, thumbnails) do not.
Images are CSS backgrounds (see HTML rule 3), so the rule is set on the element that has the background.
An img element is tolerated only for content from the user's own data (avatars, thumbnails, previews).

#### 9. Single Line
An area made for one line of text must never wrap: set white-space: nowrap, overflow: hidden, and text-overflow: ellipsis on the text, and min-width: 0 when it sits in a flex row, so it shortens instead of breaking.

#### 10. Capitals
A long text, such as a sentence, a description, a hint, or a message, is never all capitals: write it in normal case and do not use text-transform: uppercase on it.
Only short labels may be all capitals, such as a button, a tab, a tag, or a heading of one or two words.

#### 11. Line Width
Every line is var(--border-width) (1px): borders, outlines, and the shadow lines that stand in for a border (such as the line under the active tab). The exceptions are the keyboard focus outline, the coloured line of the active tab and of a hovered project, the line at the start of the active folder in the Drivemu sidebar, and the border of the card of the splash screen, which are var(--border-width-thick) (2px) so they stand out.
Do not make a border thicker to stand out; use a colour instead.

#### 12. Border Style and Radius
Every border is solid: no dashed, dotted, or double border.
Corners: an element that stands alone is rounded with a --border-radius variable of assets/css/style.css: medium for a button, an input, a select, a textarea, small for a tag or a thumbnail, large for a dialog, a menu, a toast.
An element that touches another one is square, with border-radius: 0 set by its app: a bar and what is in it, a group of buttons (such as the view switch), tabs, the rows of a table, a grid of cells, such as the project cards of the main website. Checkboxes, radios, and ranges are square.
Do not write another radius. This is a trial: change the variables, or the list of square elements, to change the look.

#### 13. Buttons, Inputs and Selects
The default look has no colour of its own: the text colour and the background follow the parent, with a gray border, and a gray background on hover. This is set once in assets/css/style.css.
A button that holds only an icon, with no text, is a perfect square: give it the class square, which gives it no padding and a width equal to its height (see Spacing). Every app is checked against this, also buttons made by script.
Do not make a button, input, or select borderless. A variant (primary, danger, and so on) may have its own colours.

#### 14. Page Layout
Every app has three elements directly in the body: the header, the main, and the footer; an app that has a sidebar has the sidebar too, so it has four. None of them is wrapped in another element. Besides them, every app has the popups element, #popups.popups, directly in the body: it holds the dialog and the toasts of assets/js/popup.js, and it has no box of its own (display: contents), so it takes no place in the page. Other elements may be in the body too (a menu, a hidden helper).
The header is on top and has the brand at the start and the account button at the end (in an app that has no account button, such as the main website, what it has instead). The footer is at the bottom and has the hint line (the status, see Questions and Messages) and the copyright. The main website also has in its footer the buttons of its two pages, About and Terms and conditions: their texts are in its data.js ("pages"), a page is shown in the main instead of the directory, and it is in the address (?page=about). They are not repeated in the main or in the sidebar.
In an app that has a sidebar, on a wide screen the header is above the sidebar and has the width of the sidebar (the account button is flush with the end edge of the sidebar), the footer is under the sidebar, and the main is beside the three, from the top to the bottom. On a narrow screen the header goes across the top of the page, the main is under it, and the footer is under the main; the sidebar is hidden, and opens over the main with the button that is at the end of the header, next to the account button.
The spacing of the page is the padding and the gap of the body (a grid). The elements may have a padding of their own when they need one, and have none when they do not.
In an app that has a sidebar, the main is wrapped in a border (var(--border-width), solid, with var(--border-radius-large)), and the header, the sidebar, and the footer have no border and sit on the page background. In an app that has no sidebar, the main has no border of its own: the parts inside it have theirs.
The header, the sidebar, and the footer are written as the tags kit-header, kit-sidebar, and kit-footer (assets/js/components.js), which build their parts, so an app does not write them again. The parts have the same ids and classes in every app: #header.header, with .logo (.logo-mark and .logo-name) and .header-tools (#account-button, #menu-button, #theme-button); #main.main, with .topbar when it has a bar on top; #footer.footer, with #status and the .copyright link; #popups.popups; and, when there is a sidebar, #sidebar.sidebar, with #sidebar-nav.sidebar-nav, its .sidebar-item and .sidebar-title, and a .sidebar-summary for a box of numbers, #sidebar-overlay and #sidebar-resizer when there are. The width of the sidebar is --sidebar-width. A new app uses these names, and any other thing that two apps have in common is named the same in both.

#### 15. Control Width
A button, an input, a select, or any other control whose size does not change, or whose size must not follow its content, has a width that is set, as a multiple of the height: for example calc(var(--height) * 3), that is three times the height of the control. Its label, value, or placeholder then stays inside that width on one line, and is shortened with an ellipsis when it is too long for it (see Single Line). The set width is the same wherever the same control is used.
A button that holds only an icon already has the width of its height (see Spacing). A control whose width must follow its content, such as a tag, or that fills a row of free width, such as a search box or a text area, keeps the width of its content or of the row.

#### 16. Templates
What every app would make again is made once, in assets/css/style.css and assets/js/components.js, and shown in Kitmu, which follows the list of components of shadcn/ui (Layout, Display, Actions, Navigation, Forms, Overlays, Chat, Helpers and Popups: every component of that list has its place there). An app loads style.css; its layout.css has only what is its own, and does not write again a rule that the template already has (the page with its header, sidebar, main and footer, the buttons, the icons, the search box, the progress bar, the button group and the segmented control, the expandable part, the alert, the badge, the field and the switch, the separator, the spinner, the skeleton, the card, the item, the avatar, the code block, the table, the checkbox and the radio, the breadcrumb, the tabs, the pagination, the menu and the popover, the tooltip, the hover card, the menubar, the slider, the code of a one time password, the calendar, the chart, the data table, the carousel, the resizable panels, the choices and the questionnaire, the message with its bubble, marker, trace and attachment, the empty state). A script of an app does not write again a helper of components.js (element, icon, formatSize, extensionOf, status, drawer, download, expand, menu, popover, select, otp, resizable, carousel, calendar, chart, dataTable, scroller, questionnaire). A select is the select of the kit: an app writes the tag select as always, and assets/js/components.js opens the menu of the kit for it (never the list of the browser); data-native (which keeps the list of the browser) is not used by any app. A component with one part is a class; a component with several parts is one tag (kit-alert, kit-card, kit-item, kit-empty, kit-attachment, kit-message, kit-collapsible, kit-breadcrumbs, kit-tabs, kit-pagination, kit-trace-line, kit-marker, kit-field, kit-search, and the parts of the page: kit-header, kit-sidebar, kit-footer), written in the HTML or made with components.make, so an app never copies the parts of a component and a change of the component reaches every app. The open item of a list is the class on, as in the sidebar. What is highlighted (the primary button, the item that is on, a checkbox that is checked, the spinner, the bars) has the colour --highlight, which is the colour of the app (--brand); an app whose buttons are white says so with one line in its layout.css: :root { --highlight: var(--accent); --highlight-ink: var(--accent-ink); }.
When two apps need the same new thing, it is added to the template and to Kitmu, and both apps use it; it is not copied from one app to the other. The one thing that stays in the layout.css of each app is the logo, .logo-mark { background-image: url("favicon.png"); }, because a path in a shared file does not follow the app.

#### 17. Desktop First
Every app is made for the desktop first, then for the narrower screens. The CSS that is not in a media query is the one of a wide screen, and the narrower screens (a tablet, a phone) change it with @media (max-width: ...), never the other way (a base for the phone made wider with min-width). A new app is first made and checked on a wide window; only when it is right there is it made right on a tablet and on a phone. Nothing is hidden or cut on a narrow screen that a wide one shows, unless the rule says so (the sidebar goes in a drawer, the account button stays).
Check an app in more than one size, not in one: a wide and tall window, a wide and low window, and a narrow one. In a column of parts, only the box that holds the content (a text box, a list) takes the free height; the other parts keep the height of their content, and a part never lies over another when the window is low (the page scrolls instead).

## Other

#### 1. Structure
/favicon.png - the app's icon, leave it to me.
/assets - holds what is shared, in folders: css (the styles), js (the scripts), data (what the scripts read: brand.js and popup.js), and fonts. A new shared file goes in the folder of its kind, and a script finds the data beside its own folder (../data/...).
/assets/css/style.css - the shared styles: fonts, colours, the theme, the reset, the basics of input and select, the templates of what every app makes again (icons, buttons, the search box, the progress bar, the segmented control, the empty state, and the rest, shown in Kitmu), and the page: the header, the footer, the main, and the sidebar with its drawer.
/assets/js/theme.js - applies the saved theme and the effects of the Appearance page before the page shows (runs synchronously to prevent FOUC).
/assets/js/kancamu.js - the single JS bundle (ES module) loaded by every page after theme.js: contains icons (all SVG masks), cleanup, urlState, i18n, popups, autocomplete, components, account, settings, storage, and transfer.
/assets/data/brand.js - the id, the name, and the highlighted word of the brand.
/assets/data/appearance.js - the Appearance page of the account app: the splash screen of the main website and the effects, with their defaults and texts, in every language.
/assets/data/kit.js - the texts that the tags kit-* have on their own (the account button, the copyright, previous and next), in every language.
/assets/data/popup.js - the texts of the buttons of the popups, in every language.
/assets/data/auth.js - the sign-in with GitHub: the client id (public), the scope, and the address of the Worker. Never a secret.
/assets/tools - what helps to make the project and is not an app: assets/tools/og-cards.mjs makes the preview.png of the main website and of the apps from their cards in Assetmu (see HTML 9), assets/tools/seo.mjs makes sitemap.xml, robots.txt, and what a search engine reads in the pages (see HTML 10), assets/tools/sprites.mjs makes the sprites of the splash screen and the icons, assets/tools/data.mjs reads a data.js for a tool, and assets/tools/muai-helper is the Rust program of muAI for the files of the PC (a Cargo project: its target folder is not kept).
/assets/images - the images that are content of the site, such as the ones of the splash screen: every image is made once, compressed, in the one format of the folder (WebP), and the original is kept beside it with the ending _raw (cinnadust_raw.jpg, cinnadust.webp). The apps use the compressed ones, never the _raw ones.
/assets/fonts - holds the fonts.
Each app has its own folder in the root with index.html, layout.css, app.js, and data.js (the root itself is the main website).
/assetmu - the app that shows every asset (the colours, the icons, the fonts, the sizes, and the files of /assets, and the colour and icon of every app). A new icon or font goes in its folder and in the lists of assetmu/data.js.
/kitmu - the UI kit: shows each template of style.css, each helper of components.js, and how to use the popups of popup.js, with the code to copy and a way to try it. A new template, helper or popup goes in its file and in the lists of kitmu/data.js.
/youmu - the account app: the sign-in, the profile, and the settings of every app, embedded by every other app in a dialog. Its pages are chosen by the query string (see Other 4), and its panels.js holds the work on the data of the apps (see Other 8).
/muos - the web OS, with its own design, languages, tests, and file index (run npm run index in it after adding or removing files).
/artcraft - the official web builds of the ArtCraft apps, one folder per app, with data.js (the installed versions) and update.ps1.

#### 2. Icons
All icons live inline in /assets/js/kancamu.js and are shared, so no app has its own icons folder.
Names are universal (close, plus, trash), not specific to one app.
When two icons are the same but look different, keep the one that is better looking and fits shared use.
Icons are used as CSS masks and their colour is currentColor.

#### 3. Fonts
Every app uses the fonts in /assets/fonts. Do not load fonts from outside and do not keep fonts in an app's own folder.

#### 4. Account
The GitHub sign-in, the profile, and the settings of every app are pages of the account app (/youmu), chosen by the query string: ?page=login, ?page=profile, and ?page=settings&app=<app>. With no page, it shows the profile, or the sign-in when there is no account.
No other web builds its own sign-in screen, login form, profile panel, or settings dialog.
The account is kept in localStorage under the key "account" ({ token, login, name, avatar }) and handled only by assets/js/account.js.
An app has one button for all of it, an icon-only square button with the class "account", placed after the other buttons of its header, and calls account.bind(button): it opens the account app in a dialog on the settings of that app (the profile or the sign-in when the app has no settings; the sidebar of the account app has the profile and the settings of every app) and shows the avatar once signed in. An app has no settings button.
An app that needs GitHub reads account.get() and listens to account.onChange(); when there is no account it asks the user to sign in with account.open().
The sign-in is "Sign in with GitHub" (an OAuth App, scope repo): account.signInWithGitHub() sends the page to GitHub, GitHub sends it back to /youmu/callback.html, and the code is traded for a token by the Worker of kancamu-auth, the one place that knows the client secret (a secret is never in an app, in assets/data, or in git: .dev.vars and .env are ignored). The client id and the address of the Worker are in assets/data/auth.js. A token that expires is no account any more: the app asks for the sign-in again.

#### 5. Data Storage
The data of a user is kept in one private GitHub repository named after the brand: <id>-data, with the "id" of assets/data/brand.js (today kancamu-data), in the account of the signed-in user. The repository is made empty, without the README.md that GitHub can add by itself (nothing is in it that nobody asked for): assets/js/storage.js makes its first commit, the empty file AppData/.gitkeep, through the contents API, because the git data API of GitHub (which Drivemu uses for many files at once) does not work in a repository that has no commit (it answers 409; GitHub documents it, and the contents API as the way to initialize the repository, in https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-your-git-database).
There is one branch, the default one (main), and the data of every app is in a folder of its own inside the folder AppData: AppData/muai, AppData/lingomu, and so on. An app only reads and writes its own folder, never the folder of another app and never anything outside AppData. Drivemu is a file explorer of the whole repository: its root is the root of the repository, so its folders (Documents, Images, Videos, Audio) are next to AppData, and AppData is a folder in it like the others (nothing is hidden). The data of Drivemu itself, if it has any (a json file), is in AppData/drivemu like the data of every app. The limit of the size (5 GB, a recommendation of GitHub) is of the whole repository, so every app shares it.
One exception: some apps work on the files of the Drive, so they use the Drive (the root of the repository). Gallemu and Spotimu (whose content is the images, videos, and audio of the Drive) only read it, with storage.tree and storage.readBinary. Picmu reads images and videos from it and saves its results into it with storage.writeBinary, as new files; it replaces a file only when the user agrees, and it never deletes. No other app reads or writes the folder of another app.
Drivemu uses the root of the repository as the root of the drive and shows everything in it, also AppData (and a README.md when the repository has one: a new repository is made without it, so that nothing is in it that nobody asked for, and its first commit is the empty file AppData/.gitkeep; one that was made before may have the README.md that GitHub made). It opens the repository with storage.drive() (storage.connect("drivemu") is the folder AppData/drivemu, for its own data). A new drive starts with the folders Documents, Images, Videos, and Audio (each kept by an empty .gitkeep), and the sidebar lists the folders at the root.
muAI keeps a chat per file in conversations/<id>.json, loaded when the chat is opened, and the files attached to chats in files/<sha256>, named by the hash of their content, so a file is stored once whatever chat it was attached in.
An app gets its folder from assets/js/storage.js: storage.connect("<app>") creates the repository when it is not there yet, and storage.readFile, storage.writeFile, storage.list, storage.tree, storage.readBinary, storage.writeBinary, and storage.removeFile work with the files of the folder (the paths are inside it; the storage adds AppData/<app>/). It does not build its own repository name or path. The apps that work on the files of the Drive (Gallemu, Spotimu, Picmu, and the account app) open it with storage.drive(). Two apps may save at the same moment on the one branch: the storage tries a save again when GitHub answers 409, and so does Drivemu for its commits.
The reset of an app deletes the data in its own folder only: the reset of Drivemu deletes the files of the Drive and its own folder AppData/drivemu (never the rest of AppData, and never README.md) and makes the default folders again, the deletion of the chats of muAI and the reset of the progress of Lingomu and muJS delete their own files. A reset never touches the folder of another app.
What the code keeps in the browser (localStorage, sessionStorage, IndexedDB, Cache Storage) is named after the app that keeps it ("<app>.settings", "lingomu.progress", the database "muai"), except theme, lang, and account, which are shared. When the code stops using a key, a database, or a cache, its name is added to the lists of assets/js/cleanup.js, which every app loads and which deletes those names from the browser of the user. It deletes only what is listed: muOS and the apps of ArtCraft run on the same origin and keep their own data in the same places.

#### 6. ArtCraft
Never edit the files inside /artcraft/<app>: they are the official builds and are replaced on every update.
Run artcraft/update.ps1 to update them: it downloads the latest official web zip of each app from GitHub, checks it, and records the version in artcraft/data.json.
The colour, tagline, and translations of each app are kept in the main data.js.

#### 7. Folder Names
A folder that holds many files of the same kind uses the plural form, such as assets, fonts, and icons.

#### 8. Settings
Everything of an app that the user can adjust is one of its settings, and every setting of every app is in the account app (/youmu/?page=settings&app=<app>): the model of an AI, the volume of a player, the background of a result, the width of a sidebar. The only exceptions are how a list is shown (grid or list view) and how it is sorted. The language and the theme are the buttons of the header of the account app. Its sidebar lists the account and every app, and the button of an app that has no settings yet is disabled.
An app describes its settings in its data.js: "settings": { "defaults": { ... }, "fields": [ { id, type, label, hint, min, max, step } ], "panels": [ ... ] }. The type of a field is textarea, number, range, select, checkbox, or color; a select takes its options from "options", or from a list of the data.js of the app ("optionsFrom": { "list", "value", "label", "labelPrefix" }). A field is saved at once, kept between its min and max, in localStorage under "<app>.settings". A panel does what a field cannot, on the data of the app (the list of the models of muAI, Picmu, Speechmu, and Transmu, which is also their choice of a model: one list with every model, the radio that chooses it, whether it is downloaded, and its deletion; an app with several tools (Picmu) gives each model its own "choose", the setting that holds the choice of its tool, and a "group", the text of the heading above the models of the tool; the chats of muAI; the usage and the reset of Drivemu): its code is in youmu/panels.js, not in the app. The same thing is never in two lists: when an app chooses one of its models, the choice is in the list of its models, not in a field above it.
An app has no settings dialog and no settings button. It reads its settings with settings.get and follows a change with settings.onChange (assets/js/settings.js). An app may keep a control for a setting in its page (the model picker, the volume slider, the background switch) as well: the control and the account app write the same settings with settings.set, and each follows the other. When the account app did something to the data of an app (deleted its chats, reset its drive), the app shows what is left by listening with settings.listen.
What the user is doing is not a setting: the open folder, the text of a search, the file that is shown. It is in the address of the page (see General 13).

#### 9. Files Between Apps
A file can be dragged from an app to the tab of another app in the main website, and dropped on it: a file of the Drive (Drivemu, Gallemu) or a file of the computer. An app makes a file of the Drive draggable with transfer.drag (assets/js/transfer.js), and an app that takes files calls transfer.take(event) in its drop handler, which gives the files of the drop.
The drag of an image carries the image itself; any other file carries a link to it, and the app that gets it reads the file from the Drive. The main website is told which file is dragged, and hands it to the app of the tab as a real file, so an app of another maker takes it too. This is a workaround for what the browsers do not give, and it is retested from time to time (see TODO.md). There is no list of the tabs that take files: an app that has no drop area ignores the drop.
