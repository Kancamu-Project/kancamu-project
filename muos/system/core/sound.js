import { settings } from './settings.js';
import { SOUNDS } from '../config/sound.js';
import { SOUND_VOLUME_CURVE, SOUND_MAX_GAIN } from '../config/sound.js';

/**
 * System sounds, synthesised with Web Audio (no audio files needed).
 * They follow the volume and mute switches and the "System sounds" setting.
 * Browsers only start audio after the user has clicked or pressed a key;
 * before that, a sound is simply skipped.
 */

let context = null;

function audio() {
  if (!context) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    try {
      context = new Context();
    } catch {
      return null;
    }
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

/** Output level 0..1 from the volume setting (a gentle curve, and capped so it never startles). */
function level() {
  if (!settings.get('sounds') || settings.get('muted')) return 0;
  return Math.pow(Math.max(0, Math.min(100, Number(settings.get('volume')))) / 100, SOUND_VOLUME_CURVE) * SOUND_MAX_GAIN;
}

/** Play 'startup' | 'shutdown' | 'notify' | 'error' | 'ding'. Returns false when nothing was played. */
export function playSound(name) {
  const notes = SOUNDS[name];
  const gain = level();
  if (!notes || gain <= 0) return false;
  const ctx = audio();
  if (!ctx || ctx.state !== 'running') return false;
  const now = ctx.currentTime + 0.02;
  for (const [freq, start, length, wave = 'triangle'] of notes) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, now + start);
    env.gain.exponentialRampToValueAtTime(gain, now + start + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
    osc.connect(env).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + length + 0.05);
  }
  return true;
}
