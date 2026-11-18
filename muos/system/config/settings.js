/**
 * Every setting and its default.
 * Values of the OS code live in system/config/; the code only uses them.
 */

/** Every setting the OS knows about, with its default value. */
export const DEFAULTS = Object.freeze({
  // Personalization
  theme: 'system', // 'system' (follows the device) | 'light' | 'dark'
  accent: '#007aff',
  wallpaper: 'auto', // 'auto' | 'file:<path in the virtual disk>' | 'color:#rrggbb'
  wallpaperFit: 'fill', // 'fill' | 'fit' | 'stretch' | 'center'
  transparency: true,
  animations: true,

  // Taskbar & Start
  taskbarAlign: 'center', // 'center' | 'left'
  dockBehavior: 'auto', // 'show' | 'auto' (out of the way while a window covers it) | 'hide'
  taskbarTaskView: true,
  taskbarWidgets: true,
  startupApps: {}, // app id -> true/false: what the user chose in Settings → Apps → Startup, over the "startup" behavior of apps.json
  appInstall: {}, // app id -> true/false: what the user chose in the Store, over the "installed" default of apps.json
  taskbarPinned: null, // null = defaults from apps.json, otherwise a list of app ids
  startPinned: null,
  startRecommended: true,

  // Desktop
  desktopIconSize: 'medium', // 'small' | 'medium' | 'large'
  desktopSort: 'name', // 'name' | 'size' | 'type' | 'date'
  // Clipboard
  clipboardHistory: true, // remember what is copied (Alt+V shows it)

  // Accessibility & windows
  highContrast: false,
  colorFilter: 'none', // 'none' | 'grayscale' | 'inverted' | 'grayscaleInverted'
  focusIndicator: false, // a thicker ring around the control that has the keyboard focus
  snapWindows: true, // dragging a window to a screen edge snaps it
  snapLayouts: true, // the layouts panel under the maximize button
  updateChecked: 0, // when "Check for updates" last ran (time in ms)

  desktopSortDir: 'asc', // 'asc' | 'desc'
  desktopAutoArrange: false, // true = the icons always fill the grid in order; dragging does not stick
  desktopShowIcons: true,
  desktopLayout: {}, // icon key -> [column, row] chosen by dragging

  // Time & language
  language: 'en-US',
  clock24h: false,
  clockSeconds: false,

  // Account & device
  userName: 'Kanca',
  deviceName: 'KANCA-DESKTOP',
  lockOnStartup: true,

  // Quick settings
  wifi: true,
  bluetooth: false,
  airplane: false,
  airplanePrev: null,
  energySaver: false,
  nightLight: false,
  doNotDisturb: false,
  brightness: 100,
  volume: 60,
  muted: false,
  sounds: true,

  // File Explorer
  explorerView: 'details', // 'details' | 'list' | 'small' | 'medium' | 'large' | 'xl' | 'tiles'
  explorerPane: 'none', // the pane on the right: 'none' | 'preview' | 'details'
  explorerNavPane: true, // the folder tree on the left

  // First-run bookkeeping
  welcomed: false
});
