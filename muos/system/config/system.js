/**
 * Theme, wallpaper, network and volume.
 * Values of the OS code live in system/config/; the code only uses them.
 */

export const THEME_KEYS = new Set(['theme', 'accent', 'transparency', 'animations', 'energySaver', 'highContrast', 'colorFilter', 'focusIndicator']);

/** The mode used when the setting says 'system' and the browser cannot tell which one the device prefers. */
export const THEME_FALLBACK = 'dark';

/** The media query that tells whether the device prefers a light look. */
export const THEME_LIGHT_QUERY = '(prefers-color-scheme: light)';
export const THEME_DARK_QUERY = '(prefers-color-scheme: dark)';

export const DEFAULT_WALLPAPERS = Object.freeze({
  light: 'wallpapers/wallpaper_default_light.webp',
  dark: 'wallpapers/wallpaper_default_dark.webp'
});

export const WALLPAPER_FIT = {
  fill: 'center / cover no-repeat',
  fit: 'center / contain no-repeat',
  stretch: 'center / 100% 100% no-repeat',
  center: 'center / auto no-repeat'
};

export const WALLPAPER_KEYS = new Set(['wallpaper', 'wallpaperFit', 'theme']);

export const NETWORK_KEYS = new Set(['wifi', 'airplane', 'bluetooth']);

export const VOLUME_KEYS = new Set(['volume', 'muted']);
