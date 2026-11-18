/**
 * The virtual disk: paths, folders, limits, the database, the files it starts with.
 * Values of the OS code live in system/config/; the code only uses them.
 */

import { OS_INFO } from './osinfo.js';
import { DEFAULTS } from './settings.js';

export const FS_VERSION = 2;

export const SEP = '/';

export const ROOT_PATH = 'C:/';

/** The home folder of the user the system starts with; its name is the default "userName" (config/settings.js). */
export const HOME = `C:/Users/${DEFAULTS.userName}`;

export const KNOWN_FOLDERS = Object.freeze({
  desktop: `${HOME}/Desktop`,
  documents: `${HOME}/Documents`,
  downloads: `${HOME}/Downloads`,
  music: `${HOME}/Music`,
  pictures: `${HOME}/Pictures`,
  videos: `${HOME}/Videos`
});

/** Special, non-disk location used in change events for the Recycle Bin. */
export const TRASH = 'shell:trash';

export const FALLBACK_CAPACITY = 256 * 1024 * 1024;

export const SAVE_DELAY = 200;

export const INVALID_NAME = /[\\/:*?"<>|\u0000-\u001f]/;

/** The file that is opened in Notepad the first time the system starts (and again after a reset). */
export const WELCOME_FILE = 'Welcome.txt';
/** The folder on the desktop (named after the OS) that holds the welcome file and the guide. */
export const WELCOME_FOLDER = OS_INFO.name;
export const WELCOME_PATH = `${KNOWN_FOLDERS.desktop}/${WELCOME_FOLDER}/${WELCOME_FILE}`;

/** The longer guide that sits beside it. */
export const GUIDE_FILE = 'Guide.txt';
export const GUIDE_PATH = `${KNOWN_FOLDERS.desktop}/${WELCOME_FOLDER}/${GUIDE_FILE}`;

export const WELCOME_TEXT = `Welcome to muOS

muOS is a desktop that runs entirely in your browser: windows, a taskbar, a Start
menu, a file system and a set of apps, made with plain HTML, CSS and JavaScript.
There is nothing to install.

Everything you create is saved in this browser, on this device only.

Start by clicking the Start button, or right-click the desktop.
For more, open Guide.txt, which is in the same folder as this file.
`;

export const GUIDE_TEXT = `muOS guide


GETTING AROUND
  - Click the Start button (or tap the Meta key) to open apps and search.
  - Right-click the desktop to add items or to personalize the look.
  - The taskbar shows your open apps. Click an icon to open it or bring it
    forward. Drag a window by its title bar, and drop it at a screen edge to snap it.
  - The corner of the taskbar has the quick settings (network, volume, battery),
    the clock with the calendar, and the icons of apps running in the background.

SHORTCUTS
  Alt+Tab                     switch between windows
  Alt+T                       Task View and virtual desktops
  Alt+V                       clipboard history
  Alt+Z                       widgets
  Ctrl+Shift+Esc              Task Manager
  Print Screen                Snipping Tool
  Alt+Shift+Left / Right      snap the window to the left / right half

THINGS TO TRY
  - File Explorer: create folders and text documents, drag files, use the Recycle Bin.
  - Settings: light and dark mode, language, wallpaper, taskbar, sound.
  - Store: install more apps, and remove the ones you do not use.
  - Command Prompt: type "help" to see the commands.

FILES AND STORAGE
  Your files and settings stay in this browser's storage. Clearing the site
  data of the browser removes them. The files of the system are in C:/System:
  they can be read and copied, but not changed.

START OVER
  Settings > System > About > Reset PC removes all files and settings and starts
  muOS from scratch. Welcome.txt opens again the next time it starts.
`;

export const DB_NAME = 'webos-disk';

export const SYNC_ERRORS = new Set(['ENOENT', 'EEXIST', 'ENOTDIR', 'EISDIR', 'ENOTEMPTY', 'EINVAL', 'EPERM', 'ENOSPC', 'ENODRIVE']);
