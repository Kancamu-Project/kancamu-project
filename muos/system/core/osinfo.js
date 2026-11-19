import { OS_INFO, BRAND_FILE } from '../config/osinfo.js';
import { ROOT, fetchJSON } from './paths.js';
export { OS_INFO } from '../config/osinfo.js';

/** The name of the brand, from the file shared by every web ('' when it cannot be read). */
export async function brandName() {
  try {
    return (await fetchJSON(new URL(BRAND_FILE, ROOT).href)).name ?? '';
  } catch {
    return '';
  }
}
