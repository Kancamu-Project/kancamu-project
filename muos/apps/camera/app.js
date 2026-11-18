import { os, t, i18n, fs, h, KNOWN_FOLDERS, join, describeError, alertDialog } from 'webos/sdk/app.js';

await os.ready;

const $ = (id) => document.getElementById(id);
const video = $('video');
const message = $('message');
const shutter = $('shutter');
const countEl = $('count');
const flash = $('flash');
const last = $('last');
const deviceSelect = $('device');
const timerBtn = $('timer');
const mirrorBtn = $('mirror');

const state = { stream: null, mirror: true, timer: false, lastPath: null, busy: false };
const ROLL = join(KNOWN_FOLDERS.pictures, 'Camera Roll');

function labels() {
  shutter.setAttribute('aria-label', t('camera.capture'));
  shutter.dataset.tip = t('camera.capture');
  timerBtn.textContent = t('camera.timer');
  timerBtn.classList.toggle('is-on', state.timer);
  mirrorBtn.textContent = t('camera.mirror');
  mirrorBtn.classList.toggle('is-on', state.mirror);
  last.dataset.tip = t('camera.openLast');
}

function stop() {
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
}

async function start(deviceId) {
  stop();
  shutter.disabled = true;
  message.textContent = t('camera.starting');
  if (!navigator.mediaDevices?.getUserMedia) {
    message.textContent = t('camera.unsupported');
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = state.stream;
    await video.play().catch(() => {});
    message.textContent = '';
    shutter.disabled = false;
    await listDevices();
  } catch (err) {
    const key = err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'camera.denied' : err.name === 'NotFoundError' || err.name === 'OverconstrainedError' ? 'camera.none' : 'camera.failed';
    message.textContent = t(key);
  }
}

async function listDevices() {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  deviceSelect.hidden = cams.length < 2;
  const active = state.stream?.getVideoTracks()[0]?.getSettings().deviceId;
  deviceSelect.replaceChildren(...cams.map((d, i) => h('option', { value: d.deviceId, selected: d.deviceId === active }, d.label || `${t('camera.device')} ${i + 1}`)));
}

const pad = (n) => String(n).padStart(2, '0');

async function capture() {
  if (!state.stream || !video.videoWidth) return;
  const scale = Math.min(1, 1280 / video.videoWidth);
  const c = h('canvas', { width: Math.round(video.videoWidth * scale), height: Math.round(video.videoHeight * scale) });
  const ctx = c.getContext('2d');
  if (state.mirror) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', 0.82);
  const d = new Date();
  const name = `WIN_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}_${pad(d.getMinutes())}_${pad(d.getSeconds())}.jpg`;
  try {
    if (!fs.exists(ROLL)) await fs.mkdir(ROLL, { recursive: true });
    state.lastPath = await fs.writeLink(join(ROLL, name), data, Math.round(data.length * 0.75));
    $('last-img').src = data;
    last.hidden = false;
    flash.classList.remove('is-on');
    void flash.offsetWidth;
    flash.classList.add('is-on');
  } catch (err) {
    alertDialog(t('camera.saveFailed'), describeError(err));
  }
}

async function shoot() {
  if (state.busy) return;
  if (!state.timer) return capture();
  state.busy = true;
  for (let n = 3; n > 0; n--) {
    countEl.textContent = n;
    countEl.hidden = false;
    await new Promise((r) => setTimeout(r, 1000));
  }
  countEl.hidden = true;
  state.busy = false;
  capture();
}

shutter.addEventListener('click', shoot);
timerBtn.addEventListener('click', () => ((state.timer = !state.timer), labels()));
mirrorBtn.addEventListener('click', () => {
  state.mirror = !state.mirror;
  video.classList.toggle('is-mirrored', state.mirror);
  labels();
});
deviceSelect.addEventListener('change', () => start(deviceSelect.value));
last.addEventListener('click', () => state.lastPath && os.openPath(state.lastPath));
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    shoot();
  }
});
window.addEventListener('pagehide', stop);
i18n.on('change', labels);

video.classList.add('is-mirrored');
labels();
start();
