import { apps } from '../core/apps.js';
import { t } from '../core/i18n.js';
import { confirmDialog } from '../ui/dialog.js';

/**
 * Remove an app from the desktop, after asking. Open windows of the app close
 * with it (see main.js). Apps without "removable" in their behaviors cannot be
 * removed, so nothing here offers it for them.
 */
export async function uninstallApp(app) {
  if (!apps.isRemovable(app.id)) return false;
  const name = apps.name(app);
  const ok = await confirmDialog(t('uninstall.title', { name }), t('uninstall.message', { name }), { okLabel: t('uninstall.action'), danger: true });
  if (ok) apps.setInstalled(app.id, false);
  return ok;
}
