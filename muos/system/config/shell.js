/**
 * The desktop: boot, windows, notifications, clipboard history, power, snapping, snips, widgets, quick settings.
 * Values of the OS code live in system/config/; the code only uses them.
 */

export const MIN_BOOT_TIME = 1400;

/** How long a page waits for the OS to answer its hello before it behaves as a plain page (ms). */
export const CHANNEL_TIMEOUT = 1600;

export const CLIPBOARD_HISTORY_LIMIT = 25; // items that are not pinned

export const CLIPBOARD_MAX_TEXT = 100000;

export const CLIPBOARD_MAX_STORED_IMAGE = 250000; // bigger pictures stay in memory only

export const NOTIFICATION_LIFETIME = 5600;

export const NOTIFICATIONS_MAX_KEPT = 30;

export const QUICK_SETTINGS_TILES = [
  { key: 'wifi', icon: 'wifi', label: 'quick.wifi' },
  { key: 'bluetooth', icon: 'bluetooth', label: 'quick.bluetooth' },
  { key: 'airplane', icon: 'airplane', label: 'quick.airplane' },
  { key: 'energySaver', icon: 'leaf', label: 'quick.energySaver' },
  { key: 'nightLight', icon: 'night-light', label: 'quick.nightLight' },
  { key: 'doNotDisturb', icon: 'dnd', label: 'quick.doNotDisturb' }
];

/** The patterns offered under the maximize button; each entry is a zone a window can be snapped to. */
export const SNAP_PATTERNS = [
  ['left', 'right'],
  ['left-66', 'right-33'],
  ['left-33', 'right-66'],
  ['col-1', 'col-2', 'col-3'],
  ['left', 'top-right', 'bottom-right'],
  ['top-left', 'top-right', 'bottom-left', 'bottom-right']
];

export const SNAP_SHOW_DELAY = 600;

export const SNAP_HIDE_DELAY = 200;

export const SNIP_MODES = ['rect', 'window', 'full', 'free'];

export const SNIP_MIN_SIDE = 4;

export const TASK_PREVIEW_SHOW_DELAY = 400;

export const TASK_PREVIEW_HIDE_DELAY = 200;

export const WIDGET_ZONES = [
  ['UTC', 'UTC'],
  ['America/New_York', 'New York'],
  ['Europe/London', 'London'],
  ['Asia/Tokyo', 'Tokyo']
];

export const WINDOW_TITLE_HEIGHT = 32;

export const SNAP_EDGE = 6; // distance from a screen edge that triggers snapping

export const SNAP_CORNER = 110; // size of the corner zones along an edge

/** Geometry of every non-free layout, relative to the work area. */
export const WINDOW_LAYOUTS = {
  max: { left: '0%', top: '0%', width: '100%', height: '100%' },
  left: { left: '0%', top: '0%', width: '50%', height: '100%' },
  right: { left: '50%', top: '0%', width: '50%', height: '100%' },
  'top-left': { left: '0%', top: '0%', width: '50%', height: '50%' },
  'top-right': { left: '50%', top: '0%', width: '50%', height: '50%' },
  'bottom-left': { left: '0%', top: '50%', width: '50%', height: '50%' },
  'bottom-right': { left: '50%', top: '50%', width: '50%', height: '50%' },
  'left-66': { left: '0%', top: '0%', width: '66.667%', height: '100%' },
  'right-33': { left: '66.667%', top: '0%', width: '33.333%', height: '100%' },
  'left-33': { left: '0%', top: '0%', width: '33.333%', height: '100%' },
  'right-66': { left: '33.333%', top: '0%', width: '66.667%', height: '100%' },
  'col-1': { left: '0%', top: '0%', width: '33.333%', height: '100%' },
  'col-2': { left: '33.333%', top: '0%', width: '33.333%', height: '100%' },
  'col-3': { left: '66.667%', top: '0%', width: '33.333%', height: '100%' }
};

/** ms after the first start before the welcome file opens. */
export const WELCOME_OPEN_DELAY = 1000;

/** ms the boot screen fades before it is removed. */
export const BOOT_REMOVE_DELAY = 800;

/** ms between two "disk is full" warnings. */
export const DISK_WARNING_INTERVAL = 15000;

/** ms a page waits for the OS stylesheet before it renders anyway. */
export const SDK_STYLE_TIMEOUT = 2000;

/** ms after which a page tells its window it has rendered (covers a hidden tab). */
export const SDK_READY_DELAY = 200;

/** ms the clipboard history ignores copies after it pasted something itself. */
export const CLIPBOARD_QUIET_DELAY = 400;

/** ms the desktop icons stay hidden while they are redrawn. */
export const DESKTOP_REFRESH_DELAY = 100;

/** ms a new wallpaper fades in before the old layer is removed. */
export const WALLPAPER_FADE = 600;

/** ms the lock screen takes to slide away. */
export const LOCK_LEAVE_DELAY = 400;

/** ms a notification toast takes to leave. */
export const NOTIFICATION_EXIT_DELAY = 200;

/** ms after "Sleep" before the screen may be woken (so the same click does not wake it). */
export const SLEEP_ARM_DELAY = 400;

/** ms between the shutdown sound and the "turn on" screen. */
export const POWER_OFF_DELAY = 1800;

/** ms of the restart screen before the page is loaded again. */
export const POWER_RESTART_DELAY = 1800;

/** ms the OS waits for a page to answer "may I close your window?"; a page that does not answer does not keep it. */
export const CLOSE_ANSWER_TIMEOUT = 8000;

/** ms between the readings of how late the shell timer runs. */
export const METRICS_TICK = 100;

/** Least number of page elements counted for the shell itself. */
export const METRICS_MIN_SHELL_NODES = 300;

/** ms to wait for a video frame in browsers that cannot say when one arrives. */
export const SNIP_FRAME_FALLBACK = 200;

/** ms per step of the snip countdown. */
export const SNIP_COUNTDOWN_TICK = 1000;

/** ms after the full second at which the clock is redrawn. */
export const CLOCK_TICK_MARGIN = 15;

/** ms after typing stops before the widget notes are saved. */
export const NOTES_SAVE_DELAY = 400;

/** ms after which a window shows its page even if the page never said it was ready. */
export const WINDOW_READY_FALLBACK = 600;

/** Narrowest a new window may be made to fit the screen (px). */
export const WINDOW_MIN_FIT_WIDTH = 240;

/** Shortest a new window may be made to fit the screen (px). */
export const WINDOW_MIN_FIT_HEIGHT = 160;

/** Space kept free around a new window (px). */
export const WINDOW_SCREEN_MARGIN = 16;

/** ms a dialog takes to close. */
export const DIALOG_CLOSE_DELAY = 100;

/** ms the pointer rests on a menu item before its submenu opens. */
export const MENU_SUBMENU_DELAY = 200;

/** ms a menu takes to fade away when it closes (the length of "menu-out" in style/ui.css). */
export const MENU_CLOSE_DELAY = 100;

/** ms the pointer rests on something before its tooltip shows. */
export const TOOLTIP_DELAY = 600;

/** Colour of the selection outline on a screen snip. */
export const SNIP_OUTLINE_COLOR = '#ffffff';

/** What a page in a frame of the OS (in a window or in the background) is allowed to do in the browser. */
export const APP_FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads';

/** The referrer a page in a frame of the OS sends: none. */
export const APP_FRAME_REFERRER_POLICY = 'no-referrer';

/** Most items a tray menu may have (what an app asks for beyond this is cut off). */
export const TRAY_MENU_MAX_ITEMS = 30;

/** Longest tooltip of a tray icon, in characters. */
export const TRAY_TOOLTIP_MAX_LENGTH = 200;

/** Gap between a tray icon and its menu (px), and the side of the icon the menu opens to. */
export const TRAY_MENU_GAP = 8;
export const TRAY_MENU_PLACEMENT = 'bottom-center';

/** Gap between the Start button and the menu that opens on a right-click (px). */
export const QUICK_LINK_MENU_GAP = 8;

/** The dock: how much the tile under the pointer grows (1 = not at all), and how far the growing reaches (in widths of a tile). */
export const DOCK_ZOOM_SCALE = 1.5;
export const DOCK_ZOOM_REACH = 2.4;

/** The dock that hides: ms the pointer rests at the bottom edge before it comes up, and ms after the pointer left before it goes down. */
export const DOCK_REVEAL_DELAY = 400;
export const DOCK_HIDE_DELAY = 600;

/** ms after a window changed before the dock looks at the windows once more (a window moves to its new size with an animation). */
export const DOCK_SETTLE_DELAY = 400;

/** Gap between a button of the menu bar and the menu that opens below it (px). */
export const MENUBAR_MENU_GAP = 4;
