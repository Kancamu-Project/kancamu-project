import { h, icon } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { playSound } from '../core/sound.js';
import { SLEEP_ARM_DELAY, POWER_RESTART_DELAY, POWER_OFF_DELAY } from '../config/shell.js';

/** Lock, sign out, sleep, restart and shut down. */
export function createPower(shell) {
  const el = document.getElementById('power');

  function show(className, ...children) {
    shell.flyouts.close();
    el.className = `power ${className}`;
    el.replaceChildren(...children);
    el.hidden = false;
  }

  function busy(messageKey) {
    show('is-busy', h('div', { class: 'power-logo', 'aria-hidden': 'true' }), h('div', { class: 'power-progress', 'aria-hidden': 'true' }, h('span')), h('p', { class: 'power-message' }, t(messageKey)));
  }

  function lock() {
    shell.lock.show();
  }

  async function signOut() {
    if (!(await shell.wm.requestCloseAll())) return;
    shell.lock.show({ login: true });
  }

  /** Black screen until a key or the mouse wakes the machine, then the lock screen. */
  function sleep() {
    show('is-sleep');
    const wake = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', wake, true);
      shell.lock.show();
      el.hidden = true;
    };
    // armed a moment later so the click that chose "Sleep" does not wake it again
    setTimeout(() => {
      window.addEventListener('pointerdown', wake, true);
      window.addEventListener('keydown', wake, true);
    }, SLEEP_ARM_DELAY);
  }

  async function restart() {
    if (!(await shell.wm.requestCloseAll())) return;
    busy('power.restarting');
    await shell.disk.flush();
    setTimeout(() => window.location.reload(), POWER_RESTART_DELAY);
  }

  async function shutDown() {
    if (!(await shell.wm.requestCloseAll())) return;
    busy('power.shuttingDown');
    playSound('shutdown');
    await shell.disk.flush();
    setTimeout(() => {
      const button = h('button', { class: 'power-on', type: 'button', 'aria-label': t('power.turnOn'), onclick: () => window.location.reload() }, icon('power', { size: 28 }));
      show('is-off', button, h('p', { class: 'power-message' }, t('power.turnOn')));
      button.focus({ preventScroll: true });
    }, POWER_OFF_DELAY);
  }

  return { lock, signOut, sleep, restart, shutDown };
}
