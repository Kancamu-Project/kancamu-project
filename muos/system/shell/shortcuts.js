import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { apps } from '../core/apps.js';

/**
 * Global keyboard shortcuts and the window switcher.
 *
 * Browsers keep Alt+Tab and the Meta key for themselves, so the shell
 * uses combinations a page can really receive:
 *   Alt+Q (hold Alt, press Q again to go on; Shift = backwards)  switch windows
 *   Alt+W                       show the desktop
 *   Alt+S                       search
 *   Alt+T                       Task View
 *   Alt+V                       clipboard history
 *   Alt+Z                       widgets
 *   Alt+D                       the dock, while it is hidden: up or down
 *   Ctrl+Shift+Esc              Task Manager
 *   Print Screen, Alt+Shift+S   Snipping Tool
 *   Ctrl+Alt+Left / Right       previous / next virtual desktop; Ctrl+Alt+D adds one
 *   Alt+1 ... Alt+9             open / switch to the n-th taskbar app
 *   Alt+Shift+Left / Right      snap the window to the left / right half
 *   Alt+Shift+Up / Down         maximize, or restore / minimize
 *   Meta key (alone)            Start menu, when the browser passes it on
 *
 * App windows forward their key events here (see the SDK), so the shortcuts
 * work whichever window has the focus.
 */
export function createShortcuts(shell) {
  const { wm, flyouts } = shell;
  const switcher = createSwitcher(shell);
  let metaAlone = false;

  const locked = () => shell.lock?.locked || !document.getElementById('power').hidden;

  /** @param {{type: string, key: string, code: string, altKey: boolean, ctrlKey: boolean, shiftKey: boolean, metaKey: boolean}} e */
  function handle(e) {
    if (locked()) return false;
    // a key that typed a real character (Option+Q on a Mac) is left to the text field
    if (/^[^\x00-\x7F]$/.test(e.key)) return false;

    if (e.type === 'keyup') {
      if (e.key === 'Alt' && switcher.isOpen) {
        switcher.commit();
        return true;
      }
      if (e.key === 'Meta' && metaAlone) {
        metaAlone = false;
        flyouts.toggle('start');
        return true;
      }
      return false;
    }

    if (e.key === 'Meta') {
      metaAlone = true;
      return false;
    }
    metaAlone = false;

    if (switcher.isOpen && e.key === 'Escape') {
      switcher.cancel();
      return true;
    }
    if ((e.key === 'PrintScreen' || (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyS')) && e.type === 'keydown') {
      const app = apps.byRole('screenshot');
      if (!app) return false;
      flyouts.close();
      shell.launch(app.id, { snip: true });
      return true;
    }
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.key === 'Escape') {
      const app = apps.byRole('task-manager');
      if (!app) return false;
      flyouts.close();
      shell.launch(app.id);
      return true;
    }
    if (e.altKey && e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        wm.setDesktop(wm.desktop + (e.code === 'ArrowLeft' ? -1 : 1));
        return true;
      }
      if (e.code === 'KeyD') {
        wm.setDesktop(wm.addDesktop());
        return true;
      }
    }
    if (!e.altKey || e.ctrlKey || e.metaKey) return false;

    if (e.shiftKey && e.code.startsWith('Arrow')) return arrange(e.code);
    if (e.shiftKey && e.code !== 'KeyQ') return false;

    if (e.code === 'KeyQ') {
      switcher.step(e.shiftKey ? -1 : 1);
      return true;
    }
    if (e.code === 'KeyW') {
      wm.toggleShowDesktop();
      return true;
    }
    if (e.code === 'KeyS') {
      flyouts.toggle('search');
      return true;
    }
    if (e.code === 'KeyV') {
      flyouts.toggle('clipboard');
      return true;
    }
    if (e.code === 'KeyT') {
      shell.taskView?.toggle();
      return true;
    }
    if (e.code === 'KeyZ') {
      flyouts.toggle('widgets');
      return true;
    }
    if (e.code === 'KeyD') {
      shell.taskbar.toggleReveal();
      return true;
    }
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit) return openTaskbarApp(Number(digit[1]) - 1);
    return false;
  }

  function arrange(code) {
    const win = wm.active;
    if (!win) return false;
    if (code === 'ArrowLeft') wm.setLayout(win.id, 'left');
    else if (code === 'ArrowRight') wm.setLayout(win.id, 'right');
    else if (code === 'ArrowUp') wm.setLayout(win.id, 'max');
    else if (win.layout === 'normal') wm.minimize(win.id);
    else wm.setLayout(win.id, 'normal');
    return true;
  }

  function openTaskbarApp(index) {
    const id = shell.taskbar.appIds()[index];
    if (!id) return false;
    flyouts.close();
    const wins = wm.byApp(id, { here: true });
    if (!wins.length) {
      shell.launch(id);
    } else {
      // most recently used window of the app; pressing again on the active one minimizes it
      const top = [...wm.stack].reverse().map((winId) => wm.get(winId)).find((w) => w.appId === id && w.desktop === wm.desktop);
      if (wm.activeId === top.id && !top.minimized) wm.minimize(top.id);
      else wm.activate(top.id);
    }
    return true;
  }

  const plain = (e) => ({ type: e.type, key: e.key, code: e.code, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey });
  for (const type of ['keydown', 'keyup']) {
    document.addEventListener(
      type,
      (e) => {
        if (handle(plain(e))) e.preventDefault();
      },
      true
    );
  }
  window.addEventListener('blur', () => switcher.cancel());

  return { handle, switcher };
}

/** The Alt+Q overlay: windows in most-recently-used order, selection moves with each press. */
function createSwitcher(shell) {
  const { wm } = shell;
  const layer = h('div', { class: 'switcher', hidden: true });
  const row = h('div', { class: 'switcher-row', role: 'listbox' });
  layer.append(row);
  document.getElementById('screen').append(layer);

  let list = [];
  let index = 0;

  function render() {
    row.setAttribute('aria-label', t('switcher.label'));
    row.replaceChildren(
      ...list.map((win, i) => {
        const item = h(
          'button',
          { class: `switcher-item${i === index ? ' is-selected' : ''}`, type: 'button', role: 'option', 'aria-selected': String(i === index), tabIndex: -1 },
          h('img', { src: win.app.icon, alt: '', draggable: false }),
          h('span', null, win.title)
        );
        item.addEventListener('click', () => {
          index = i;
          commit();
        });
        return item;
      })
    );
  }

  function step(delta) {
    if (layer.hidden) {
      list = [...wm.stack].reverse().map((id) => wm.get(id)).filter(Boolean);
      if (!list.length) return;
      index = delta > 0 ? Math.min(1, list.length - 1) : list.length - 1;
      layer.hidden = false;
    } else {
      index = (index + delta + list.length) % list.length;
    }
    render();
  }

  function cancel() {
    layer.hidden = true;
  }

  function commit() {
    const win = list[index];
    layer.hidden = true;
    if (win && wm.get(win.id)) wm.activate(win.id);
  }

  return {
    get isOpen() {
      return !layer.hidden;
    },
    step,
    cancel,
    commit
  };
}
