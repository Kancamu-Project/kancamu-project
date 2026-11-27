/**
 * What the OS says about itself.
 * Values of the OS code live in system/config/; the code only uses them.
 */

/** Name and version shown in Settings > About and in Command Prompt. */
export const OS_INFO = Object.freeze({
  name: 'muOS',
  version: '1.0.0',
  build: '2026.11',
  copyright: '© {brand}'
});

/** Where the name of the brand is written (relative to the OS root): the one place, shared by every web. */
export const BRAND_FILE = '../assets/data/brand.json';
