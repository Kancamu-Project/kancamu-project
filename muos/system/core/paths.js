/**
 * Absolute URL of the OS root folder (the folder that holds index.html).
 * Works from the shell as well as from any app page inside /apps.
 */
export const ROOT = new URL('../../', import.meta.url).href;

/** Resolve a path relative to the OS root, e.g. url('icons/wifi.svg'). */
export function url(relative) {
  return new URL(relative, ROOT).href;
}

/** Fetch and parse a JSON file, always revalidating with the server. */
export async function fetchJSON(href) {
  const res = await fetch(href, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${href} (${res.status})`);
  return res.json();
}
