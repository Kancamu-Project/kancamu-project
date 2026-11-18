import {
  os,
  t,
  i18n,
  h,
  icon,
  hydrateIcons,
  showDialog,
  readJSON,
  writeJSON,
  settings,
  apps,
  fs,
  FsError,
  normalize,
  join,
  dirname,
  basename,
  HOME,
  ROOT_PATH,
  OS_INFO,
  battery,
  networkState,
  formatBytes
} from 'webos/sdk/app.js';

await os.ready;
await apps.init();

const root = document.getElementById('root');
const viewport = document.getElementById('viewport');
const tabsEl = document.getElementById('tabs');
const input = document.getElementById('input');

// the console of the active tab: its scroll box, output and command line
let terminal = null;
let output = null;
let promptEl = null;
let beforeEl = null;
let cursorEl = null;
let afterEl = null;


const SERIAL = '5A3F-0B11';
const COLORS = ['#0c0c0c', '#0037da', '#13a10e', '#3a96dd', '#c50f1f', '#881798', '#c19c00', '#cccccc', '#767676', '#3b78ff', '#16c60c', '#61d6d6', '#e74856', '#b4009e', '#f9f1a5', '#f2f2f2'];

const startDir = typeof os.args.cwd === 'string' ? fs.stat(os.args.cwd) : null;
const startCwd = startDir?.type === 'dir' ? startDir.path : HOME;

function newState(cwd) {
  return {
    cwd,
    history: [],
    historyIndex: -1, // -1 = a new line is being typed
    draft: '',
    errorlevel: 0,
    env: new Map(), // variables changed with SET: upper-case name -> { name, value }
    completion: null,
    sink: null, // collects output while it is redirected to a file or a pipe
    stdin: null, // the lines piped into a filter
    cleared: false,
    title: '',
    batchDepth: 0
  };
}

let state = newState(startCwd);

/* --------------------------------- output --------------------------------- */

function appendRaw(text) {
  output.append(document.createTextNode(text));
  if (output.childNodes.length > 3000) {
    while (output.childNodes.length > 2000) output.firstChild.remove();
  }
}

/** Print one line of normal output (goes into the file when redirected). */
function write(text = '') {
  if (state.sink) state.sink.push(text);
  else appendRaw(`${text}\n`);
}

/** Print an error: always to the console, and the command counts as failed. */
function fail(text, code = 1) {
  appendRaw(`${text}\n`);
  state.errorlevel = code;
}

function scrollToEnd() {
  terminal.scrollTop = terminal.scrollHeight;
}

const pad = (text, width) => String(text).padStart(width);
const num = (value) => i18n.number(value);
const stripQuotes = (text) => text.replace(/"/g, '').trim();
const byName = (a, b) => a.name.localeCompare(b.name, i18n.lang, { numeric: true, sensitivity: 'base' });

/* ------------------------------- input line ------------------------------- */

function renderLine() {
  const value = input.value;
  const pos = input.selectionStart ?? value.length;
  promptEl.textContent = `${state.cwd}>`;
  beforeEl.textContent = value.slice(0, pos);
  cursorEl.textContent = value.slice(pos, pos + 1) || ' ';
  afterEl.textContent = value.slice(pos + 1);
}

function setInput(value) {
  input.value = value;
  input.setSelectionRange(value.length, value.length);
  renderLine();
  scrollToEnd();
}

function focusInput() {
  input.focus({ preventScroll: true });
}

function recall(step) {
  if (!state.history.length) return;
  if (state.historyIndex === -1) {
    if (step > 0) return;
    state.draft = input.value;
    state.historyIndex = state.history.length;
  }
  const next = state.historyIndex + step;
  if (next < 0) return;
  if (next >= state.history.length) {
    state.historyIndex = -1;
    setInput(state.draft);
    return;
  }
  state.historyIndex = next;
  setInput(state.history[next]);
}

/** Tab completion of file and folder names (press Tab again for the next match). */
function complete(step) {
  let c = state.completion;
  if (!c) {
    const caret = input.selectionStart ?? input.value.length;
    const value = input.value.slice(0, caret);
    let start = 0;
    let quoted = false;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '"') quoted = !quoted;
      else if (value[i] === ' ' && !quoted) start = i + 1;
    }
    const word = value.slice(start).replace(/"/g, '');
    const slash = Math.max(word.lastIndexOf('\\'), word.lastIndexOf('/'));
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
    const prefix = word.slice(slash + 1).toLowerCase();
    let entries;
    try {
      entries = fs.list(normalize(dirPart || '.', state.cwd));
    } catch {
      return;
    }
    const names = entries
      .filter((entry) => entry.name.toLowerCase().startsWith(prefix))
      .sort(byName)
      .map((entry) => entry.name);
    if (!names.length) return;
    c = state.completion = { head: value.slice(0, start), dirPart, names, index: step > 0 ? -1 : 0, tail: input.value.slice(caret) };
  }
  c.index = (c.index + step + c.names.length) % c.names.length;
  const full = c.dirPart + c.names[c.index];
  const text = c.head + (/\s/.test(full) ? `"${full}"` : full);
  input.value = text + c.tail;
  input.setSelectionRange(text.length, text.length);
  renderLine();
  scrollToEnd();
}

let running = false;

async function submit() {
  if (running) return; // the console is busy with the last line
  const line = input.value;
  appendRaw(`${state.cwd}>${line}\n`);
  setInput('');
  state.completion = null;
  state.historyIndex = -1;
  state.draft = '';
  if (line.trim()) {
    if (state.history[state.history.length - 1] !== line) state.history.push(line);
    running = true;
    try {
      await execute(line);
    } catch (err) {
      console.error(err);
      fail(String(err?.message || err));
    } finally {
      running = false;
    }
    if (!state.cleared) appendRaw('\n');
    state.cleared = false;
  }
  renderLine();
  renderTabs();
  scrollToEnd();
}

input.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Enter') {
    e.preventDefault();
    submit();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    recall(-1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    recall(1);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    complete(e.shiftKey ? -1 : 1);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    state.completion = null;
    setInput('');
  } else if (mod && e.key.toLowerCase() === 'c' && input.selectionStart === input.selectionEnd) {
    // Ctrl+C with nothing selected cancels the line
    e.preventDefault();
    appendRaw(`${state.cwd}>${input.value}^C\n`);
    state.completion = null;
    state.historyIndex = -1;
    setInput('');
  } else if (e.key !== 'Shift') {
    state.completion = null;
  }
});

input.addEventListener('input', () => {
  if (/[\r\n]/.test(input.value)) input.value = input.value.replace(/[\r\n]+/g, ' ');
  state.completion = null;
  renderLine();
  scrollToEnd();
});
for (const type of ['keyup', 'select']) input.addEventListener(type, renderLine);
input.addEventListener('focus', () => {
  terminal.classList.add('has-focus');
  renderLine();
});
input.addEventListener('blur', () => terminal.classList.remove('has-focus'));
document.addEventListener('selectionchange', () => {
  if (document.activeElement === input) renderLine();
});

// Any typing goes to the command line, even right after text was selected with the mouse.
document.addEventListener(
  'keydown',
  (e) => {
    if (e.target !== input && !e.ctrlKey && !e.metaKey && !e.altKey) focusInput();
  },
  true
);
function onMouseUp(e) {
  if (e.button === 0 && String(window.getSelection()) === '') focusInput();
}

function onContext(e) {
  e.preventDefault();
  const selected = String(window.getSelection());
  os.menu(
    [
      { label: t('files.copy'), icon: 'copy', shortcut: 'Ctrl+C', disabled: !selected, action: () => navigator.clipboard?.writeText(selected).catch(() => {}) },
      {
        label: t('files.paste'),
        icon: 'paste',
        shortcut: 'Ctrl+V',
        action: async () => {
          try {
            const text = (await navigator.clipboard.readText()).replace(/[\r\n]+/g, ' ');
            focusInput();
            input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
            renderLine();
          } catch {
            focusInput(); // clipboard access was refused: Ctrl+V still works
          }
        }
      },
      {
        label: t('cmd.menu.selectAll'),
        icon: 'select-all',
        action: () => window.getSelection().selectAllChildren(output)
      },
      { separator: true },
      { label: t('cmd.tabs.new'), icon: 'plus', shortcut: 'Ctrl+Shift+T', action: () => newSession() },
      {
        label: t('cmd.menu.clear'),
        icon: 'delete',
        action: () => {
          output.replaceChildren();
          focusInput();
        }
      }
    ],
    e
  );
}

os.window.on('activate', focusInput);
window.addEventListener('focus', focusInput);

/* --------------------------------- parsing -------------------------------- */

const STATIC_ENV = () => ({
  COMPUTERNAME: settings.get('deviceName'),
  COMSPEC: 'C:/System/cmd.exe',
  HOMEDRIVE: 'C:',
  HOMEPATH: HOME.slice(2),
  NUMBER_OF_PROCESSORS: String(navigator.hardwareConcurrency || 1),
  OS: 'muOS',
  PATH: 'C:/System',
  PROMPT: '$P$G',
  SYSTEMDRIVE: 'C:',
  SYSTEMROOT: 'C:/System',
  USERNAME: settings.get('userName'),
  USERPROFILE: HOME
});

function dateText(date = new Date()) {
  return i18n.date(date, { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' });
}

function timeText(date = new Date()) {
  return i18n.date(date, { hour: 'numeric', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 2, hourCycle: 'h23' });
}

function envValue(name) {
  const key = name.toUpperCase();
  if (state.env.has(key)) return state.env.get(key).value;
  const dynamic = {
    CD: state.cwd,
    DATE: dateText(),
    TIME: timeText(),
    RANDOM: String(Math.floor(Math.random() * 32768)),
    ERRORLEVEL: String(state.errorlevel)
  };
  return dynamic[key] ?? STATIC_ENV()[key];
}

const expandEnv = (line) => line.replace(/%([^%\s]+)%/g, (match, name) => envValue(name) ?? match);

/** Split "a && b & c" into commands. `op` is the operator in front of a command. */
function splitCommands(line) {
  const parts = [];
  let current = '';
  let quoted = false;
  let op = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    if (!quoted && (ch === '&' || ch === '|')) {
      const double = line[i + 1] === ch;
      parts.push({ text: current, op });
      current = '';
      op = double ? ch + ch : ch;
      if (double) i++;
      continue;
    }
    current += ch;
  }
  parts.push({ text: current, op });
  return parts;
}

/** Cut "> file" / ">> file" off a command. */
function parseRedirect(text) {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === '>' && !quoted) {
      const append = text[i + 1] === '>';
      return { command: text.slice(0, i), file: stripQuotes(text.slice(i + (append ? 2 : 1))), append };
    }
  }
  return { command: text, file: null, append: false };
}

function tokenize(text) {
  const tokens = [];
  let current = '';
  let quoted = false;
  let started = false;
  for (const ch of text) {
    if (ch === '"') {
      quoted = !quoted;
      started = true;
    } else if (!quoted && /\s/.test(ch)) {
      if (started) tokens.push(current);
      current = '';
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }
  if (started) tokens.push(current);
  return tokens;
}

function context(rest) {
  const tokens = tokenize(rest);
  const switches = new Set();
  const params = [];
  for (const token of tokens) {
    if (token.startsWith('/') && token.length > 1) {
      for (const part of token.split('/').filter(Boolean)) switches.add(`/${part.toLowerCase()}`);
    } else {
      params.push(token);
    }
  }
  return { rest, tokens, switches, params };
}

const resolve = (path) => normalize(path, state.cwd);

function globToRegExp(pattern) {
  const source = (pattern === '*.*' ? '*' : pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${source}$`, 'i');
}

/** "docs\*.txt" -> { dir: 'docs', pattern: '*.txt' };  pattern is null without wildcards. */
function splitPattern(target) {
  const slash = Math.max(target.lastIndexOf('\\'), target.lastIndexOf('/'));
  const last = target.slice(slash + 1);
  if (!/[*?]/.test(last)) return { dir: target, pattern: null };
  return { dir: slash >= 0 ? target.slice(0, slash + 1) : '.', pattern: last };
}

/** Entries matched by a path that may end in a wildcard. */
function expand(target) {
  const { dir, pattern } = splitPattern(target);
  if (!pattern) {
    const entry = fs.stat(resolve(dir));
    return entry ? [entry] : [];
  }
  const base = fs.stat(resolve(dir));
  if (!base || base.type !== 'dir') return [];
  const re = globToRegExp(pattern);
  return fs.list(base.path).filter((entry) => re.test(entry.name)).sort(byName);
}

const FS_MESSAGES = {
  ENOENT: 'cmd.errors.pathNotFound',
  EEXIST: 'cmd.errors.duplicateName',
  ENOTDIR: 'cmd.errors.dirNameInvalid',
  EISDIR: 'cmd.errors.accessDenied',
  ENOTEMPTY: 'cmd.errors.notEmpty',
  EINVAL: 'cmd.errors.syntax',
  EPERM: 'cmd.errors.accessDenied',
  ENOSPC: 'cmd.errors.diskFull',
  ENODRIVE: 'cmd.errors.driveNotFound'
};

const fsMessage = (err) => t(FS_MESSAGES[err.code] || 'cmd.errors.syntax');

/* -------------------------------- commands -------------------------------- */

const COMMANDS = {
  cd: { alias: ['chdir'], syntax: 'CD [/D] [path]', run: cmdCd },
  cls: { syntax: 'CLS', run: cmdCls },
  color: { syntax: 'COLOR [attr]', run: cmdColor },
  copy: { syntax: 'COPY source [destination]', run: cmdCopy },
  date: { syntax: 'DATE [/T]', run: cmdDate },
  del: { alias: ['erase'], syntax: 'DEL [/Q] names', run: cmdDel },
  dir: { syntax: 'DIR [path] [/B]', run: cmdDir },
  echo: { syntax: 'ECHO [message]', run: cmdEcho },
  exit: { syntax: 'EXIT', run: cmdExit },
  help: { syntax: 'HELP [command]', run: cmdHelp },
  hostname: { syntax: 'HOSTNAME', run: () => write(settings.get('deviceName')) },
  ipconfig: { syntax: 'IPCONFIG', run: cmdIpconfig },
  md: { alias: ['mkdir'], syntax: 'MD path', run: cmdMd },
  move: { syntax: 'MOVE source destination', run: cmdMove },
  rd: { alias: ['rmdir'], syntax: 'RD [/S] [/Q] path', run: cmdRd },
  ren: { alias: ['rename'], syntax: 'REN path newname', run: cmdRen },
  set: { syntax: 'SET [variable=[value]]', run: cmdSet },
  shutdown: { syntax: 'SHUTDOWN [/S | /R | /L | /H]', run: cmdShutdown },
  start: { syntax: 'START [app | path]', run: cmdStart },
  systeminfo: { syntax: 'SYSTEMINFO', run: cmdSysteminfo },
  taskkill: { syntax: 'TASKKILL /PID id | /IM name', run: cmdTaskkill },
  tasklist: { syntax: 'TASKLIST', run: cmdTasklist },
  time: { syntax: 'TIME [/T]', run: cmdTime },
  title: { syntax: 'TITLE [text]', run: cmdTitle },
  tree: { syntax: 'TREE [path] [/F]', run: cmdTree },
  type: { syntax: 'TYPE file', run: cmdType },
  ver: { syntax: 'VER', run: cmdVer },
  call: { syntax: 'CALL [batch | command]', run: ({ rest }) => execute(rest) },
  find: { syntax: 'FIND [/V] [/C] [/N] [/I] "string" [files]', run: cmdFind },
  findstr: { syntax: 'FINDSTR [/I] [/V] [/N] [/R] [/C:"string"] pattern [files]', run: cmdFindstr },
  if: { syntax: 'IF [NOT] EXIST path | [NOT] ERRORLEVEL n | [NOT] DEFINED var | a==b  command', run: cmdIf },
  more: { syntax: 'MORE [file]', run: cmdMore },
  path: { syntax: 'PATH', run: () => write(`PATH=${envValue('PATH')}`) },
  pause: { syntax: 'PAUSE', run: () => write(t('cmd.pause')) },
  rem: { syntax: 'REM [comment]', run: () => {} },
  sort: { syntax: 'SORT [/R] [file]', run: cmdSort },
  vol: { syntax: 'VOL', run: cmdVol },

  whoami: { syntax: 'WHOAMI', run: () => write(`${settings.get('deviceName')}\\${settings.get('userName')}`.toLowerCase()) }
};

/** Canonical command name for a name or an alias, or null. */
function lookup(name) {
  const lower = name.toLowerCase();
  if (Object.hasOwn(COMMANDS, lower)) return lower;
  return Object.keys(COMMANDS).find((key) => COMMANDS[key].alias?.includes(lower)) || null;
}

function cmdCd({ rest }) {
  const target = stripQuotes(rest.replace(/^\s*\/d\b/i, ''));
  if (!target) return write(state.cwd);
  const entry = fs.stat(resolve(target));
  if (!entry) return fail(t('cmd.errors.pathNotFound'));
  if (entry.type !== 'dir') return fail(t('cmd.errors.dirNameInvalid'));
  state.cwd = entry.path;
}

function cmdCls() {
  output.replaceChildren();
  state.cleared = true;
}

function cmdColor({ params }) {
  const attr = (params[0] || '').toLowerCase();
  if (!attr) {
    terminal.style.removeProperty('--console-bg');
    terminal.style.removeProperty('--console-fg');
    terminal.classList.remove('has-color');
    return;
  }
  if (!/^[0-9a-f]{1,2}$/.test(attr)) return fail(t('cmd.errors.syntax'));
  const bg = attr.length === 2 ? parseInt(attr[0], 16) : 0;
  const fg = parseInt(attr[attr.length - 1], 16);
  if (bg === fg) return fail(t('cmd.errors.sameColors'));
  terminal.style.setProperty('--console-bg', COLORS[bg]);
  terminal.style.setProperty('--console-fg', COLORS[fg]);
  terminal.classList.add('has-color');
}

/** Files named by a source argument: the file itself, a wildcard match, or the files of a folder. */
function sourceFiles(target) {
  const out = [];
  for (const entry of expand(target)) {
    if (entry.type === 'file') out.push(entry);
    else if (!splitPattern(target).pattern) out.push(...fs.list(entry.path).filter((child) => child.type === 'file').sort(byName));
  }
  return out;
}

async function cmdCopy({ params }) {
  if (!params.length) return fail(t('cmd.errors.syntax'));
  const files = sourceFiles(params[0]);
  if (!files.length) return fail(t('cmd.errors.fileNotFound'));
  const destPath = resolve(params[1] ?? '.');
  const dest = fs.stat(destPath);
  let copied = 0;
  for (const file of files) {
    const intoDir = dest?.type === 'dir';
    const dir = intoDir ? dest.path : dirname(destPath);
    const name = intoDir ? file.name : basename(destPath);
    const target = join(dir, name);
    if (target.toLowerCase() === file.path.toLowerCase()) {
      fail(t('cmd.errors.copyOntoItself'));
      continue;
    }
    if (fs.isFile(target)) await fs.remove(target);
    await fs.copy(file.path, dir, { name });
    copied++;
  }
  write(`${pad(copied, 9)} ${t('cmd.copy.done')}`);
}

function cmdDate({ switches }) {
  write(switches.has('/t') ? dateText() : t('cmd.date.current', { value: dateText() }));
}

function cmdTime({ switches }) {
  if (switches.has('/t')) write(i18n.date(new Date(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  else write(t('cmd.time.current', { value: timeText() }));
}

async function cmdDel({ params }) {
  if (!params.length) return fail(t('cmd.errors.syntax'));
  for (const param of params) {
    const files = sourceFiles(param);
    if (!files.length) {
      fail(t('cmd.errors.couldNotFind', { path: resolve(param) }));
      continue;
    }
    for (const file of files) {
      try {
        await fs.remove(file.path);
      } catch (err) {
        if (!(err instanceof FsError)) throw err;
        fail(`${file.path}\n${fsMessage(err)}`);
      }
    }
  }
}

function stamp(ms) {
  const date = i18n.date(ms, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = i18n.date(ms, { hour: '2-digit', minute: '2-digit', ...(settings.get('clock24h') ? { hourCycle: 'h23' } : { hour12: true }) });
  return `${date}  ${time}`;
}

function cmdDir({ params, switches }) {
  for (const sw of switches) {
    if (!['/b', '/a'].includes(sw)) return fail(t('cmd.errors.invalidSwitch', { switch: sw.slice(1) }));
  }
  const { dir, pattern } = splitPattern(params[0] ?? '.');
  const target = fs.stat(resolve(dir));
  if (!target) return fail(t('cmd.errors.fileNotFound'));

  let base = target.path;
  let entries;
  if (pattern) {
    if (target.type !== 'dir') return fail(t('cmd.errors.pathNotFound'));
    const re = globToRegExp(pattern);
    entries = fs.list(base).filter((entry) => re.test(entry.name));
  } else if (target.type === 'file') {
    base = dirname(target.path);
    entries = [target];
  } else {
    entries = fs.list(base);
  }
  entries.sort(byName);

  if (switches.has('/b')) {
    if (!entries.length) return fail(t('cmd.errors.fileNotFound'));
    entries.forEach((entry) => write(entry.name));
    return;
  }

  write(` ${t('cmd.dir.volume')}`);
  write(` ${t('cmd.dir.serial', { serial: SERIAL })}`);
  write();
  write(` ${t('cmd.dir.directoryOf', { path: base })}`);
  write();
  if (!entries.length && (pattern || target.type === 'file')) return fail(t('cmd.errors.fileNotFound'));

  let files = 0;
  let dirs = 0;
  let bytes = 0;
  const dirRow = (ms, name) => {
    dirs++;
    write(`${stamp(ms)}    <DIR>          ${name}`);
  };
  if (!pattern && target.type === 'dir' && base !== ROOT_PATH) {
    dirRow(target.mtime, '.');
    dirRow(target.mtime, '..');
  }
  for (const entry of entries) {
    if (entry.type === 'dir') {
      dirRow(entry.mtime, entry.name);
    } else {
      files++;
      bytes += entry.size;
      write(`${stamp(entry.mtime)} ${pad(num(entry.size), 17)} ${entry.name}`);
    }
  }
  write(`${pad(num(files), 16)} ${t('cmd.dir.files')} ${pad(num(bytes), 14)} ${t('cmd.dir.bytes')}`);
  write(`${pad(num(dirs), 16)} ${t('cmd.dir.dirs')}  ${pad(num(fs.usage().free), 14)} ${t('cmd.dir.bytesFree')}`);
}

function cmdEcho({ rest }) {
  if (rest.startsWith('.')) return write(rest.slice(1).trimEnd());
  const text = rest.trimEnd();
  if (!text.trim()) return write(t('cmd.echoOn'));
  if (/^(on|off)$/i.test(text.trim())) return;
  write(text);
}

function cmdHelp({ params }) {
  if (params.length) {
    const name = lookup(params[0]);
    if (!name) return fail(t('cmd.help.unknown'));
    return showHelp(name);
  }
  write(t('cmd.help.intro'));
  for (const name of Object.keys(COMMANDS)) write(`${name.toUpperCase().padEnd(14)} ${t(`cmd.help.${name}`)}`);
}

function showHelp(name) {
  const command = COMMANDS[name];
  write(t(`cmd.help.${name}`));
  write();
  write(command.syntax);
  if (command.alias?.length) {
    write();
    write(t('cmd.help.aliases', { names: command.alias.map((alias) => alias.toUpperCase()).join(', ') }));
  }
}

function cmdIpconfig() {
  const connection = navigator.connection;
  // "Label . . . . . : value" with the leader dots on a fixed grid, like the real tool
  const row = (label, value) => {
    let line = label;
    for (let pos = label.length; pos < 33; pos++) line += pos % 2 === 0 && pos > label.length ? '.' : ' ';
    write(`   ${line} : ${value}`);
  };
  const online = networkState() === 'wifi';
  write();
  write(t('cmd.ipconfig.title'));
  write();
  write(t('cmd.ipconfig.adapter'));
  write();
  row(t('cmd.ipconfig.mediaState'), t(online ? 'cmd.ipconfig.connected' : 'cmd.ipconfig.disconnected'));
  if (online && connection) {
    if (connection.effectiveType) row(t('cmd.ipconfig.type'), connection.effectiveType);
    if (connection.downlink) row(t('cmd.ipconfig.downlink'), `${connection.downlink} Mbps`);
    if (connection.rtt) row(t('cmd.ipconfig.rtt'), `${connection.rtt} ms`);
  }
}

async function cmdMd({ params }) {
  if (!params.length) return fail(t('cmd.errors.syntax'));
  for (const param of params) {
    const path = resolve(param);
    if (fs.exists(path)) fail(t('cmd.errors.exists', { name: param }));
    else await fs.mkdir(path, { recursive: true });
  }
}

async function cmdMove({ params }) {
  if (params.length < 2) return fail(t('cmd.errors.syntax'));
  const sources = expand(params[0]);
  if (!sources.length) return fail(t('cmd.errors.fileNotFound'));
  const destPath = resolve(params[1]);
  const dest = fs.stat(destPath);
  let files = 0;
  let dirs = 0;
  for (const source of sources) {
    if (dest?.type === 'dir') {
      await fs.move(source.path, dest.path);
    } else {
      if (dest?.type === 'file') await fs.remove(dest.path);
      await fs.move(source.path, dirname(destPath), { name: basename(destPath) });
    }
    if (source.type === 'dir') dirs++;
    else files++;
  }
  if (files) write(`${pad(files, 9)} ${t('cmd.move.files')}`);
  if (dirs) write(`${pad(dirs, 9)} ${t('cmd.move.dirs')}`);
}

async function cmdRd({ params, switches }) {
  if (!params.length) return fail(t('cmd.errors.syntax'));
  for (const param of params) {
    const entry = fs.stat(resolve(param));
    if (!entry) fail(t('cmd.errors.fileNotFound'));
    else if (entry.type !== 'dir') fail(t('cmd.errors.dirNameInvalid'));
    else await fs.remove(entry.path, { recursive: switches.has('/s') });
  }
}

async function cmdRen({ params }) {
  if (params.length !== 2 || /[\\/:]/.test(params[1])) return fail(t('cmd.errors.syntax'));
  const entry = fs.stat(resolve(params[0]));
  if (!entry) return fail(t('cmd.errors.fileNotFound'));
  await fs.rename(entry.path, params[1]);
}

function cmdSet({ rest }) {
  const text = rest.trim();
  const all = () => {
    const map = new Map(Object.entries(STATIC_ENV()).map(([name, value]) => [name, { name, value }]));
    for (const [key, entry] of state.env) map.set(key, entry);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  const eq = text.indexOf('=');
  if (eq < 0) {
    const list = all().filter((entry) => entry.name.toUpperCase().startsWith(text.toUpperCase()));
    if (!list.length) return fail(t('cmd.errors.envNotDefined', { name: text }));
    list.forEach((entry) => write(`${entry.name}=${entry.value}`));
    return;
  }
  const name = text.slice(0, eq).trim();
  const value = text.slice(eq + 1);
  if (!name) return fail(t('cmd.errors.syntax'));
  state.env.set(name.toUpperCase(), { name, value });
}

function cmdShutdown({ switches }) {
  const action = switches.has('/s') ? 'shutDown' : switches.has('/r') ? 'restart' : switches.has('/l') ? 'signOut' : switches.has('/h') ? 'sleep' : null;
  if (!action) return t('cmd.shutdown.usage').split('\n').forEach((line) => write(line));
  if (!os.embedded) return fail(t('cmd.errors.standalone'));
  os.power(action);
}

/** Find an app by a familiar program name, its id or its display name. */
function resolveApp(name) {
  const key = name.toLowerCase().replace(/\.exe$/, '');
  const roles = { explorer: 'file-manager', cmd: 'terminal', control: 'settings', 'ms-settings:': 'settings' };
  if (roles[key]) return apps.byRole(roles[key]);
  const squash = (text) => text.toLowerCase().replace(/[\s-]+/g, '');
  return apps.list.find((app) => app.id === key || squash(app.name) === squash(key) || squash(apps.name(app)) === squash(key)) || null;
}

function launchApp(app, params = []) {
  if (app.roles.includes('file-manager')) {
    const entry = params[0] ? fs.stat(resolve(params[0])) : null;
    os.launch(app.id, entry ? { path: entry.type === 'dir' ? entry.path : dirname(entry.path) } : {});
  } else if (app.roles.includes('terminal')) {
    os.launch(app.id, { cwd: state.cwd });
  } else {
    os.launch(app.id);
  }
}

function cmdStart({ tokens }) {
  if (!tokens.length) {
    const terminalApp = apps.byRole('terminal');
    if (terminalApp) os.launch(terminalApp.id, { cwd: state.cwd });
    return;
  }
  const [first, ...others] = tokens;
  const app = resolveApp(first);
  if (app) return launchApp(app, others);
  const entry = fs.stat(resolve(first));
  if (!entry) return fail(t('cmd.errors.startNotFound', { name: first }));
  os.openPath(entry.path);
}

function cmdSysteminfo() {
  const ua = navigator.userAgentData;
  const brand = ua?.brands?.filter((b) => !/not.?a.?brand/i.test(b.brand)).pop();
  const usage = fs.usage();
  const rows = [
    ['hostName', settings.get('deviceName')],
    ['osName', `${OS_INFO.name}`],
    ['osVersion', `${OS_INFO.version} (${OS_INFO.build})`],
    ['systemType', ua?.platform || navigator.platform || t('cmd.systeminfo.unknown')],
    ['processors', t('cmd.systeminfo.cores', { count: navigator.hardwareConcurrency || 1 })],
    ['memory', navigator.deviceMemory ? `${navigator.deviceMemory} GB` : t('cmd.systeminfo.unknown')],
    ['browser', brand ? `${brand.brand} ${brand.version}` : navigator.userAgent],
    ['display', `${window.screen.width} x ${window.screen.height}`],
    ['locale', i18n.lang],
    ['timeZone', Intl.DateTimeFormat().resolvedOptions().timeZone],
    ['disk', t('cmd.systeminfo.diskValue', { used: formatBytes(usage.used), free: formatBytes(usage.free) })],
    ['battery', battery.supported ? `${battery.percent}%` : t('cmd.systeminfo.unknown')]
  ];
  write();
  for (const [key, value] of rows) write(`${`${t(`cmd.systeminfo.${key}`)}:`.padEnd(27)}${value}`);
}

const pidOf = (id) => String(id).replace(/\D/g, '');

async function cmdTasklist() {
  if (!os.embedded) return fail(t('cmd.errors.standalone'));
  write();
  write(`${t('cmd.tasklist.image').padEnd(25)} ${t('cmd.tasklist.pid').padStart(8)} ${t('cmd.tasklist.title')}`);
  write(`${'='.repeat(25)} ${'='.repeat(8)} ${'='.repeat(32)}`);
  for (const win of await os.windows.list()) {
    write(`${`${win.appId}.exe`.padEnd(25).slice(0, 25)} ${pidOf(win.id).padStart(8)} ${win.title}`);
  }
}

async function cmdTaskkill({ tokens }) {
  if (!os.embedded) return fail(t('cmd.errors.standalone'));
  const wanted = [];
  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i].toLowerCase();
    if ((key === '/pid' || key === '/im') && tokens[i + 1]) wanted.push({ kind: key.slice(1), value: tokens[++i] });
  }
  if (!wanted.length) return fail(t('cmd.errors.syntax'));
  const windows = await os.windows.list();
  for (const { kind, value } of wanted) {
    const image = value.toLowerCase().replace(/\.exe$/, '');
    const matches = windows.filter((win) => (kind === 'pid' ? pidOf(win.id) === value : win.appId === image));
    if (!matches.length) {
      fail(t('cmd.errors.noTask', { name: value }));
      continue;
    }
    // this window goes last, so the messages for the others are still printed
    matches.sort((a, b) => Number(a.id === os.windows.currentId) - Number(b.id === os.windows.currentId));
    for (const win of matches) {
      write(t('cmd.taskkill.success', { pid: pidOf(win.id) }));
      os.windows.close(win.id);
    }
  }
}

function cmdTitle({ rest }) {
  state.title = rest.trim();
  updateTitle();
}

function cmdTree({ params, switches }) {
  const root = fs.stat(resolve(params[0] ?? '.'));
  if (!root || root.type !== 'dir') return fail(t('cmd.errors.pathNotFound'));
  const showFiles = switches.has('/f');
  write(t('cmd.tree.header'));
  write(t('cmd.tree.serial', { serial: SERIAL }));
  write(root.path.toUpperCase());
  let subfolders = 0;
  const walk = (path, prefix) => {
    const entries = fs.list(path).sort(byName);
    const dirs = entries.filter((entry) => entry.type === 'dir');
    const files = entries.filter((entry) => entry.type === 'file');
    if (showFiles && files.length) {
      const bar = dirs.length ? '│' : ' ';
      files.forEach((file) => write(`${prefix}${bar}   ${file.name}`));
      write(`${prefix}${bar}`);
    }
    dirs.forEach((dir, index) => {
      const last = index === dirs.length - 1;
      subfolders++;
      write(`${prefix}${last ? '└───' : '├───'}${dir.name}`);
      walk(dir.path, prefix + (last ? '    ' : '│   '));
    });
  };
  walk(root.path, '');
  if (!subfolders) write(t('cmd.tree.none'));
}

async function cmdType({ params }) {
  if (!params.length) return fail(t('cmd.errors.syntax'));
  for (const param of params) {
    const entry = fs.stat(resolve(param));
    if (!entry) {
      fail(t('cmd.errors.fileNotFound'));
      continue;
    }
    if (entry.type === 'dir') {
      fail(t('cmd.errors.accessDenied'));
      continue;
    }
    const lines = (await fs.readFile(entry.path)).split(/\r?\n/);
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    lines.forEach((line) => write(line));
  }
}

function cmdVer() {
  write();
  write(`${OS_INFO.name} [${t('cmd.version', { version: OS_INFO.version })}]`);
}

/* --------------------------------- filters -------------------------------- */

/** The lines a filter works on: what was piped in, or the files named. */
async function inputLines(params) {
  if (state.stdin && !params.length) return state.stdin;
  const lines = [];
  for (const param of params) {
    const entry = fs.stat(resolve(param));
    if (!entry || entry.type !== 'file') {
      fail(t('cmd.errors.fileNotFound'));
      continue;
    }
    const text = (await fs.readFile(entry.path)).split(/\r?\n/);
    if (text.length > 1 && text[text.length - 1] === '') text.pop();
    lines.push(...text);
  }
  return lines;
}

async function cmdFind({ tokens, switches }) {
  const [needle, ...files] = tokens.filter((token) => !(token.startsWith('/') && token.length > 1));
  if (needle === undefined) return fail(t('cmd.errors.syntax'));
  if (!state.stdin && !files.length) return fail(t('cmd.errors.syntax'));
  const ignore = switches.has('/i');
  const invert = switches.has('/v');
  const hit = (line) => (ignore ? line.toLowerCase().includes(needle.toLowerCase()) : line.includes(needle)) !== invert;
  const lines = await inputLines(files);
  const matched = lines.map((line, index) => ({ line, index })).filter(({ line }) => hit(line));
  if (switches.has('/c')) return write(String(matched.length));
  for (const { line, index } of matched) write(switches.has('/n') ? `[${index + 1}]${line}` : line);
}

async function cmdFindstr({ tokens, switches }) {
  const words = [];
  const files = [];
  for (const token of tokens) {
    if (/^\/c:/i.test(token)) words.push(token.slice(3));
    else if (token.startsWith('/') && token.length > 1) continue;
    else if (!words.length && !files.length) words.push(...token.split(/\s+/).filter(Boolean));
    else files.push(token);
  }
  if (!words.length) return fail(t('cmd.errors.syntax'));
  if (!state.stdin && !files.length) return fail(t('cmd.errors.syntax'));
  const ignore = switches.has('/i');
  const invert = switches.has('/v');
  let tests;
  if (switches.has('/r')) {
    try {
      tests = words.map((word) => new RegExp(word, ignore ? 'i' : ''));
    } catch {
      return fail(t('cmd.errors.syntax'));
    }
  } else {
    tests = words.map((word) => ({ test: (line) => (ignore ? line.toLowerCase().includes(word.toLowerCase()) : line.includes(word)) }));
  }
  (await inputLines(files)).forEach((line, index) => {
    if (tests.some((test) => test.test(line)) !== invert) write(switches.has('/n') ? `${index + 1}:${line}` : line);
  });
}

async function cmdSort({ params, switches }) {
  const lines = (await inputLines(params)).slice();
  lines.sort((a, b) => a.localeCompare(b, i18n.lang, { sensitivity: 'base' }));
  if (switches.has('/r')) lines.reverse();
  lines.forEach((line) => write(line));
}

async function cmdMore({ params }) {
  (await inputLines(params)).forEach((line) => write(line));
}

function cmdVol() {
  write(t('cmd.dir.volume'));
  write(t('cmd.dir.serial', { serial: SERIAL }));
}

function cmdExit() {
  closeSession(activeSession);
}

/* ------------------------------ batch files ------------------------------- */

const BATCH_EXT = /\.(bat|cmd)$/i;

/** A batch file named by the command: the file itself, or the name with .bat / .cmd added. */
function findBatch(name) {
  if (!name || /[*?]/.test(name)) return null;
  for (const candidate of BATCH_EXT.test(name) ? [name] : [`${name}.bat`, `${name}.cmd`]) {
    let entry = null;
    try {
      entry = fs.stat(resolve(candidate));
    } catch {
      /* not a path */
    }
    if (entry?.type === 'file') return entry;
  }
  return null;
}

/** "if exist x command" -> the command when the test holds, null when it does not, undefined when the line is no "if". */
function evaluateIf(line) {
  const m = /^if\s+(not\s+)?(exist|errorlevel|defined)\s+("[^"]*"|\S+)\s+(.+)$/i.exec(line);
  if (m) {
    const [, not, kind, arg, command] = m;
    const value = stripQuotes(arg);
    let ok;
    if (kind.toLowerCase() === 'exist') ok = !!fs.stat(resolve(value));
    else if (kind.toLowerCase() === 'errorlevel') ok = state.errorlevel >= Number(value);
    else ok = envValue(value) !== undefined;
    return ok !== !!not ? command : null;
  }
  const eq = /^if\s+(not\s+)?("[^"]*"|\S+?)==("[^"]*"|\S+?)\s+(.+)$/i.exec(line);
  if (eq) {
    const [, not, a, b, command] = eq;
    return (stripQuotes(a) === stripQuotes(b)) !== !!not ? command : null;
  }
  return undefined;
}

async function cmdIf({ rest }) {
  const command = evaluateIf(`if ${rest}`);
  if (command === undefined) return fail(t('cmd.errors.syntax'));
  if (command !== null) await execute(command);
}

async function runBatch(entry, args) {
  if (state.batchDepth >= 8) return fail(t('cmd.errors.batchDepth'));
  let text;
  try {
    text = await fs.readFile(entry.path);
  } catch (err) {
    if (!(err instanceof FsError)) throw err;
    return fail(fsMessage(err));
  }
  const lines = text.split(/\r?\n/);
  const labels = new Map();
  lines.forEach((line, i) => {
    const m = /^\s*:(?!:)(\S+)/.exec(line);
    if (m) labels.set(m[1].toLowerCase(), i);
  });
  const argv = [entry.path, ...args];
  const base = basename(entry.path).replace(/\.[^.]*$/, '');
  const folder = `${dirname(entry.path).replace(/\/$/, '')}/`;
  let echo = true;
  let steps = 0;
  state.batchDepth++;
  try {
    for (let i = 0; i < lines.length; i++) {
      if (++steps > 5000) {
        fail(t('cmd.errors.batchLoop'));
        break;
      }
      let line = lines[i].trim();
      if (!line) continue;
      let silent = false;
      if (line.startsWith('@')) {
        silent = true;
        line = line.slice(1).trim();
      }
      if (/^(rem(\s|$)|::)/i.test(line) || /^:\S/.test(line)) continue;
      line = line
        .replace(/%~dp0/gi, () => folder)
        .replace(/%~n0/gi, () => base)
        .replace(/%([0-9])/g, (_, d) => argv[Number(d)] ?? '');
      // "if ... command": keep the command when the test holds
      let skip = false;
      for (let guard = 0; guard < 4; guard++) {
        const next = evaluateIf(expandEnv(line));
        if (next === undefined) break;
        if (next === null) {
          skip = true;
          break;
        }
        line = next.trim();
      }
      if (skip) continue;
      const toggle = /^echo\s+(on|off)\s*$/i.exec(line);
      if (toggle) {
        echo = toggle[1].toLowerCase() === 'on';
        continue;
      }
      const go = /^goto\s+:?(\S+)/i.exec(line);
      if (go) {
        const key = go[1].toLowerCase();
        if (key === 'eof' || key === ':eof') break;
        if (!labels.has(key)) {
          fail(t('cmd.errors.label', { name: go[1] }));
          break;
        }
        i = labels.get(key);
        continue;
      }
      const leave = /^exit\s+\/b\s*(\d*)/i.exec(line);
      if (leave) {
        state.errorlevel = Number(leave[1] || 0);
        break;
      }
      if (echo && !silent) appendRaw(`${state.cwd}>${line}\n`);
      await execute(line);
    }
  } finally {
    state.batchDepth--;
  }
}

/* ---------------------------------- tabs ---------------------------------- */

const sessions = [];
let activeSession = null;
let sessionSeq = 0;

function buildSession(cwd) {
  const out = h('div', { class: 'output' });
  const prompt = h('span');
  const before = h('span');
  const cursor = h('span', { class: 'cursor' }, ' ');
  const after = h('span');
  const term = h('div', { class: 'terminal', hidden: true }, out, h('div', { class: 'line' }, prompt, before, cursor, after));
  term.addEventListener('mouseup', onMouseUp);
  term.addEventListener('contextmenu', onContext);
  viewport.append(term);
  const session = { id: ++sessionSeq, term, out, prompt, before, cursor, after, state: newState(cwd), draft: '', caret: 0 };
  sessions.push(session);
  return session;
}

function activate(session) {
  if (activeSession && activeSession !== session) {
    activeSession.draft = input.value;
    activeSession.caret = input.selectionStart ?? input.value.length;
  }
  activeSession = session;
  terminal = session.term;
  output = session.out;
  promptEl = session.prompt;
  beforeEl = session.before;
  cursorEl = session.cursor;
  afterEl = session.after;
  state = session.state;
  for (const other of sessions) other.term.hidden = other !== session;
  input.value = session.draft;
  input.setSelectionRange(session.caret, session.caret);
  renderLine();
  renderTabs();
  updateTitle();
  focusInput();
  scrollToEnd();
}

function banner() {
  appendRaw(`${OS_INFO.name} [${t('cmd.version', { version: OS_INFO.version })}]\n${t('cmd.banner')}\n\n`);
}

function newSession(cwd = state.cwd) {
  const session = buildSession(cwd);
  activate(session);
  banner();
  renderLine();
  return session;
}

function closeSession(session) {
  if (sessions.length === 1) return os.window.close();
  const at = sessions.indexOf(session);
  session.term.remove();
  sessions.splice(at, 1);
  if (session === activeSession) {
    activeSession = null;
    activate(sessions[Math.min(at, sessions.length - 1)]);
  } else renderTabs();
}

const tabLabel = (session) => session.state.title || basename(session.state.cwd) || session.state.cwd;

function renderTabs() {
  tabsEl.replaceChildren(
    ...sessions.map((session) => {
      const isActive = session === activeSession;
      const close = h('button', { class: 'tab-close', type: 'button', 'aria-label': t('cmd.tabs.close'), tabIndex: -1 }, icon('dismiss', { size: 10 }));
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSession(session);
      });
      const el = h('div', { class: `tab${isActive ? ' is-active' : ''}`, role: 'tab', 'aria-selected': String(isActive), title: session.state.cwd }, h('span', { class: 'tab-title' }, tabLabel(session)), close);
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', () => activate(session));
      el.addEventListener('auxclick', (e) => e.button === 1 && closeSession(session));
      return el;
    }),
    h('button', { class: 'tab-btn tab-add', type: 'button', 'aria-label': t('cmd.tabs.new'), 'data-tip': t('cmd.tabs.new'), onclick: () => newSession() }, icon('plus')),
    h('span', { class: 'tabs-fill' }),
    h('button', { class: 'tab-btn tab-settings', type: 'button', 'aria-label': t('cmd.settings.title'), 'data-tip': t('cmd.settings.title'), onclick: openSettings }, icon('settings'))
  );
}

/* -------------------------------- appearance ------------------------------ */

const SCHEMES = {
  campbell: ['#0c0c0c', '#cccccc', '#ffffff'],
  oneHalf: ['#282c34', '#dcdfe4', '#ffffff'],
  solarizedDark: ['#002b36', '#839496', '#eee8d5'],
  solarizedLight: ['#fdf6e3', '#657b83', '#073642'],
  tango: ['#000000', '#d3d7cf', '#ffffff'],
  vintage: ['#000000', '#c0c0c0', '#ffffff'],
  ubuntu: ['#300a24', '#eeeeec', '#ffffff'],
  retro: ['#000000', '#16c60c', '#16c60c']
};
const FONTS = ['Cascadia Mono', 'Consolas', 'Courier New', 'Lucida Console', 'monospace'];
const DEFAULT_LOOK = { scheme: 'campbell', font: 'Cascadia Mono', size: 14, cursor: 'block', opacity: 100 };
const look = { ...DEFAULT_LOOK, ...readJSON('cmd.settings', {}) };

function applyLook() {
  const [bg, fg, sel] = SCHEMES[look.scheme] ?? SCHEMES.campbell;
  const style = document.documentElement.style;
  style.setProperty('--scheme-bg', bg);
  style.setProperty('--scheme-fg', fg);
  style.setProperty('--scheme-sel', sel);
  style.setProperty('--cmd-font', `"${look.font}", Consolas, "Courier New", monospace`);
  style.setProperty('--cmd-size', `${look.size}px`);
  style.setProperty('--cmd-opacity', `${look.opacity}%`);
  root.dataset.cursor = look.cursor;
}

function saveLook() {
  try {
    writeJSON('cmd.settings', look);
  } catch {
    /* the look is kept for this session */
  }
}

async function openSettings() {
  const row = (label, control) => h('label', { class: 'pref' }, h('span', null, label), control);
  const select = (key, options, label) => {
    const el = h('select', { class: 'input', 'aria-label': label }, options.map(([value, text]) => h('option', { value, selected: String(look[key]) === String(value) }, text)));
    el.addEventListener('change', () => {
      look[key] = typeof DEFAULT_LOOK[key] === 'number' ? Number(el.value) : el.value;
      applyLook();
      saveLook();
    });
    return el;
  };
  const schemes = h('div', { class: 'schemes', role: 'radiogroup', 'aria-label': t('cmd.settings.scheme') });
  const drawSchemes = () =>
    schemes.replaceChildren(
      ...Object.entries(SCHEMES).map(([id, [bg, fg]]) => {
        const b = h('button', { class: `scheme${look.scheme === id ? ' is-active' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(look.scheme === id) }, h('span', { class: 'scheme-swatch', style: { background: bg, color: fg } }, 'C:\\>'), t(`cmd.schemes.${id}`));
        b.addEventListener('click', () => {
          look.scheme = id;
          applyLook();
          saveLook();
          drawSchemes();
        });
        return b;
      })
    );
  drawSchemes();
  const opacity = h('input', { class: 'slider', type: 'range', min: 30, max: 100, value: look.opacity, 'aria-label': t('cmd.settings.opacity') });
  opacity.addEventListener('input', () => {
    look.opacity = Number(opacity.value);
    applyLook();
    saveLook();
  });
  const { button } = await showDialog({
    title: t('cmd.settings.title'),
    content: h(
      'div',
      { class: 'prefs' },
      schemes,
      row(t('cmd.settings.font'), select('font', FONTS.map((name) => [name, name]), t('cmd.settings.font'))),
      row(t('cmd.settings.size'), select('size', [10, 12, 14, 16, 18, 20, 24].map((n) => [n, `${n}px`]), t('cmd.settings.size'))),
      row(t('cmd.settings.cursor'), select('cursor', ['block', 'bar', 'underscore'].map((kind) => [kind, t(`cmd.settings.cursors.${kind}`)]), t('cmd.settings.cursor'))),
      row(t('cmd.settings.opacity'), opacity)
    ),
    buttons: [
      { id: 'reset', label: t('cmd.settings.reset') },
      { id: 'ok', label: t('common.close'), primary: true }
    ],
    cancelId: 'ok'
  });
  if (button === 'reset') {
    Object.assign(look, DEFAULT_LOOK);
    applyLook();
    saveLook();
  }
  focusInput();
}

/* -------------------------------- execution ------------------------------- */

async function dispatch(name, rest) {
  const lower = name.toLowerCase();
  if (/^[a-z]:$/.test(lower)) {
    if (lower !== 'c:') fail(t('cmd.errors.driveNotFound'));
    return;
  }
  const command = lookup(lower);
  if (command) {
    if (rest.trim() === '/?') return showHelp(command);
    return COMMANDS[command].run(context(rest));
  }
  const batch = findBatch(stripQuotes(name));
  if (batch) return runBatch(batch, tokenize(rest));
  const app = resolveApp(lower);
  if (app) return launchApp(app, tokenize(rest));
  let entry = null;
  try {
    entry = fs.stat(resolve(stripQuotes(name)));
  } catch {
    /* not a path */
  }
  if (entry?.type === 'file') return os.openPath(entry.path);
  fail(t('cmd.errors.notRecognized', { name }), 9009);
}

async function runOne(raw, { stdin = null, capture = false } = {}) {
  const { command: text, file, append } = parseRedirect(raw);
  const command = text.trim();
  if (!command) return null;

  // built-in commands may be glued to their argument:  cd..  cd\  echo.  dir/b
  const first = /^(?:"[^"]*"|\S)+/.exec(command)[0];
  const glued = /^([a-zA-Z]+)([.\\/].*)$/.exec(first);
  let name;
  let rest;
  if (glued && lookup(glued[1])) {
    name = glued[1];
    rest = glued[2] + command.slice(first.length);
  } else {
    name = first;
    rest = command.slice(first.length).replace(/^\s/, '');
  }

  state.errorlevel = 0;
  state.sink = file !== null || capture ? [] : null;
  state.stdin = stdin;
  const sink = state.sink;
  try {
    await dispatch(name, rest);
  } catch (err) {
    if (!(err instanceof FsError)) throw err;
    fail(fsMessage(err));
  } finally {
    state.sink = null;
    state.stdin = null;
  }

  if (sink && file && file.toLowerCase() !== 'nul') {
    try {
      await fs.writeFile(resolve(file), sink.length ? `${sink.join('\r\n')}\r\n` : '', { append });
    } catch (err) {
      if (!(err instanceof FsError)) throw err;
      fail(fsMessage(err));
    }
  }
  return capture ? sink : null;
}

async function execute(line) {
  const parts = splitCommands(expandEnv(line));
  let piped = null;
  for (let i = 0; i < parts.length; i++) {
    const { text, op } = parts[i];
    if (op === '&&' && state.errorlevel !== 0) {
      piped = null;
      continue;
    }
    if (op === '||' && state.errorlevel === 0) {
      piped = null;
      continue;
    }
    const feeds = parts[i + 1]?.op === '|';
    const result = await runOne(text, { stdin: op === '|' ? piped : null, capture: feeds });
    piped = feeds ? result ?? [] : null;
  }

}

/* --------------------------------- start-up ------------------------------- */

function updateTitle() {
  os.window.setTitle(state.title);
}

applyLook();
hydrateIcons(document);
newSession(startCwd);
i18n.on('change', () => (updateTitle(), renderTabs()));

// Ctrl+Shift+T / W: tabs, Ctrl+Tab: next tab, Ctrl+,: settings
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && e.shiftKey && key === 't') (e.preventDefault(), newSession());
  else if (mod && e.shiftKey && key === 'w') (e.preventDefault(), closeSession(activeSession));
  else if (mod && key === ',') (e.preventDefault(), openSettings());
  else if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    const at = sessions.indexOf(activeSession);
    activate(sessions[(at + (e.shiftKey ? sessions.length - 1 : 1)) % sessions.length]);
  }
});

