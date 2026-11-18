import { h, icon, clear, iconUrl } from '../core/dom.js';
import { fs, join, dirname, HOME, ROOT_PATH, KNOWN_FOLDERS, isValidName, extname } from '../core/fs.js';
import { iconFor } from '../core/filetypes.js';
import { t, i18n } from '../core/i18n.js';
import { confirmDialog, alertDialog } from './dialog.js';

/**
 * Open / Save As dialog for the virtual disk.
 *   const path = await pickFile({ mode: 'open', filter: (entry) => ..., dir })
 *   const path = await pickFile({ mode: 'save', defaultName: 'Untitled.txt', extension: 'txt' })
 * Resolves with the chosen path, or null when cancelled.
 */
export function pickFile({ mode = 'open', title, dir = HOME, filter = () => true, defaultName = '', extension = '' } = {}) {
  const previous = document.activeElement;
  return new Promise((resolve) => {
    let cwd = fs.isDir(dir) ? dir : HOME;
    let selected = null;

    const pathEl = h('div', { class: 'picker-path' });
    const list = h('div', { class: 'picker-list' });
    const name = h('input', { class: 'input', type: 'text', value: defaultName, spellcheck: false, autocomplete: 'off' });
    const upBtn = h('button', { class: 'btn btn-icon', type: 'button', onclick: () => go(dirname(cwd)) }, icon('arrow-up'));
    const quick = h(
      'div',
      { class: 'picker-quick' },
      Object.entries(KNOWN_FOLDERS).map(([key, path]) => h('button', { class: 'btn btn-subtle', type: 'button', onclick: () => go(path) }, t(`folders.${key}`)))
    );

    function render() {
      pathEl.textContent = cwd;
      upBtn.disabled = cwd === ROOT_PATH;
      clear(list);
      let entries = [];
      try {
        entries = fs.list(cwd);
      } catch {
        /* folder vanished */
      }
      entries = entries.filter((e) => e.type === 'dir' || filter(e));
      const collator = new Intl.Collator(i18n.lang, { numeric: true, sensitivity: 'base' });
      entries.sort((a, b) => (a.type === b.type ? collator.compare(a.name, b.name) : a.type === 'dir' ? -1 : 1));
      if (!entries.length) list.append(h('p', { class: 'empty-note' }, t('picker.empty')));
      for (const e of entries) {
        const row = h('div', { class: `picker-row${e.path === selected ? ' is-selected' : ''}` }, h('img', { src: iconFor(e), alt: '', draggable: false }), h('span', null, e.name));
        row.addEventListener('click', () => {
          if (e.type === 'dir') return go(e.path);
          selected = e.path;
          name.value = e.name;
          list.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
          row.classList.add('is-selected');
        });
        row.addEventListener('dblclick', () => e.type === 'file' && confirm());
        list.append(row);
      }
    }

    function go(path) {
      if (!fs.isDir(path)) return;
      cwd = path;
      selected = null;
      render();
    }

    async function confirm() {
      const text = name.value.trim();
      if (mode === 'open') {
        const path = selected || (text ? fs.resolve(text, cwd) : null);
        const entry = path && fs.stat(path);
        if (!entry || entry.type !== 'file') return alertDialog(t('picker.openTitle'), t('picker.notFound'));
        return done(entry.path);
      }
      let file = text;
      if (!isValidName(file)) return alertDialog(t('picker.saveTitle'), t('fs.errors.EINVAL'));
      if (extension && !extname(file)) file += `.${extension}`;
      const path = join(cwd, file);
      if (fs.isDir(path)) return go(path);
      if (fs.exists(path) && !(await confirmDialog(t('picker.saveTitle'), t('picker.overwrite', { name: file }), { okLabel: t('picker.replace') }))) return;
      done(path);
    }

    function done(result) {
      smoke.remove();
      document.removeEventListener('keydown', onKey, true);
      if (previous && previous.isConnected) previous.focus?.({ preventScroll: true });
      resolve(result);
    }

    function onKey(e) {
      if (document.querySelectorAll('.dialog-smoke').length > 1 && e.target.closest?.('.dialog-smoke') !== smoke) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(null);
      } else if (e.key === 'Enter' && e.target === name) {
        e.preventDefault();
        confirm();
      }
    }

    const card = h(
      'div',
      { class: 'dialog picker', role: 'dialog', 'aria-modal': 'true' },
      h(
        'div',
        { class: 'dialog-body' },
        h('h2', { class: 'dialog-title' }, title || t(mode === 'open' ? 'picker.openTitle' : 'picker.saveTitle')),
        h('div', { class: 'picker-bar' }, upBtn, pathEl),
        quick,
        list,
        h('label', { class: 'picker-name' }, h('span', null, t('picker.fileName')), name)
      ),
      h(
        'div',
        { class: 'dialog-footer' },
        h('button', { class: 'btn btn-accent', type: 'button', onclick: confirm }, t(mode === 'open' ? 'picker.open' : 'picker.save')),
        h('button', { class: 'btn', type: 'button', onclick: () => done(null) }, t('common.cancel'))
      )
    );
    const smoke = h('div', { class: 'dialog-smoke' }, card);
    smoke.addEventListener('pointerdown', (e) => e.target === smoke && done(null));
    document.addEventListener('keydown', onKey, true);
    document.body.append(smoke);
    render();
    name.focus();
    name.select();
  });
}
