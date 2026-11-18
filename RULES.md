# RULES

Applies to the main website, Drivemu, muAI, and any new web in Kancamu Project.
muOS has its own visual design and ArtCraft comes from a third party, so neither is bound by the visual rules here.

## General

#### 1. Language
Everything is written in English: code, identifiers, comments, file and folder names, commit messages, and documentation such as README and RULES.
What users see is translated through the language files (en-US is the base language and the fallback), and translations into other languages are welcome.
Text that comes from a third party is the only exception.

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
Every web has at least three files: index.html, layout.css, and script.js.
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
There are seven colours in assets/style.css, named after the colour itself in English.
Black (not truly black, just dark), gray, and white for backgrounds and borders.
Red, yellow (the more orange one), blue, and green for highlights.
Other colours are derived from these seven with color-mix, so do not write new hex codes.
Components use role names (bg, fg, border, danger, and so on), which change with the dark and light theme.
Colours that come from a third party, such as an app's own brand colour, may be used as they are.

#### 7. Theme
Dark is the default, and light is set with data-theme="light" on html.
The chosen theme is stored in localStorage under the key "theme" and applied by assets/theme.js, so every web behaves the same.

## Other

#### 1. Structure
/favicon.png - the web's icon, leave it to me.
/assets - holds what is shared.
/assets/style.css - shared styles.
/assets/theme.js - applies the saved theme before the page shows.
/assets/icons - holds every svg icon for the GUI, do not use emoji.
/assets/fonts - holds the fonts.
Each web has its own folder in the root with index.html, layout.css, and script.js.

#### 2. Icons
All icons live in /assets/icons and are shared, so no web has its own icons folder.
Names are universal (close, plus, trash), not specific to one web.
When two icons are the same but look different, keep the one that is better looking and fits shared use.
Icons are used as CSS masks and their colour is currentColor.

#### 3. Fonts
Every web uses the fonts in /assets/fonts. Do not load fonts from outside and do not keep fonts in a web's own folder.

#### 4. Folder Names
A folder that holds many files of the same kind uses the plural form, such as assets, fonts, and icons.

# NOTE
Currently, only humans are permitted to modify this file.
