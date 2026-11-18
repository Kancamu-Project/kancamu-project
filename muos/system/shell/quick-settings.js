import { h, icon, setIcon, fillSlider } from '../core/dom.js';
import { settings } from '../core/settings.js';
import { apps } from '../core/apps.js';
import { i18n, t } from '../core/i18n.js';
import { playSound } from '../core/sound.js';
import { battery, batteryIcon, setAirplaneMode, volumeIcon } from '../core/system.js';
import { QUICK_SETTINGS_TILES as TILES } from '../config/shell.js';

/** Quick settings panel: toggles, brightness, volume and battery. */
export function createQuickSettings(shell) {
  const { flyouts } = shell;

  const tiles = TILES.map((def) => {
    const button = h('button', { class: 'qs-tile-btn', type: 'button', 'aria-pressed': 'false' }, icon(def.icon, { size: 20 }));
    button.addEventListener('click', () => {
      const next = !settings.get(def.key);
      if (def.key === 'airplane') setAirplaneMode(next);
      else settings.set(def.key, next);
    });
    return { def, button, el: h('div', { class: 'qs-tile' }, button, h('span', { class: 'qs-tile-label', 'data-i18n': def.label })) };
  });

  const brightness = h('input', { class: 'slider', type: 'range', min: 10, max: 100, step: 1, 'data-i18n-label': 'quick.brightness' });
  const volume = h('input', { class: 'slider', type: 'range', min: 0, max: 100, step: 1, 'data-i18n-label': 'quick.volume' });
  const volumeGlyph = icon('volume-2', { size: 18 });
  const muteBtn = h('button', { class: 'qs-icon-btn', type: 'button', onclick: () => settings.set('muted', !settings.get('muted')) }, volumeGlyph);
  const batteryText = h('span');
  const settingsBtn = h(
    'button',
    {
      class: 'qs-icon-btn',
      type: 'button',
      onclick: () => {
        const app = apps.byRole('settings');
        flyouts.close();
        if (app) shell.launch(app.id);
      }
    },
    icon('settings', { size: 16 })
  );

  brightness.addEventListener('input', () => {
    fillSlider(brightness);
    settings.set('brightness', Number(brightness.value));
  });
  volume.addEventListener('input', () => {
    fillSlider(volume);
    settings.update({ volume: Number(volume.value), muted: false });
  });
  volume.addEventListener('change', () => playSound('ding')); // a sample at the new level

  const el = h(
    'div',
    { class: 'flyout quick', id: 'quick-settings', tabIndex: -1, role: 'dialog' },
    h(
      'div',
      { class: 'qs-body' },
      h('div', { class: 'qs-tiles' }, tiles.map((tile) => tile.el)),
      h('div', { class: 'qs-slider' }, h('span', { class: 'qs-icon' }, icon('sun', { size: 18 })), brightness),
      h('div', { class: 'qs-slider' }, muteBtn, volume)
    ),
    h('div', { class: 'qs-footer' }, h('span', { class: 'qs-battery' }, batteryIcon(), batteryText), settingsBtn)
  );
  document.getElementById('flyouts').append(el);

  function update() {
    for (const { def, button } of tiles) {
      const on = !!settings.get(def.key);
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', t(def.label));
    }
    brightness.value = settings.get('brightness');
    volume.value = settings.get('muted') ? 0 : settings.get('volume');
    fillSlider(brightness);
    fillSlider(volume);
    setIcon(volumeGlyph, volumeIcon());
    muteBtn.dataset.tip = t(settings.get('muted') ? 'quick.unmute' : 'quick.mute');
    settingsBtn.dataset.tip = t('quick.allSettings');
    batteryText.textContent = `${battery.percent}%`;
  }

  el.addEventListener('contextmenu', (e) => e.preventDefault());
  flyouts.register('quick', {
    el,
    onOpen() {
      update();
      el.focus({ preventScroll: true });
    }
  });
  settings.on('change', update);
  battery.on('change', update);
  i18n.on('change', () => {
    i18n.apply(el);
    update();
  });
  i18n.apply(el);
  update();

  return { el };
}
