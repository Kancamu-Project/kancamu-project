// muJS: lessons that teach JavaScript. Each lesson explains one idea, gives a task, and has a code editor that runs the code.
// The units, the lessons, their tests, and the words to colour are in data.js. The code runs in a sandboxed frame (sandbox.js), never in this page.
// The progress (lessons done, the code that was written) is kept in this browser, and in the mujs folder of the storage once the user is signed in.

await i18n.load();

const { element, icon } = components;
const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "account-button", "menu-button", "sidebar", "sidebar-nav", "summary-text", "stepper",
  "breadcrumb-unit", "breadcrumb-lesson", "lesson-counter", "previous-button", "following-button",
  "lesson-body", "lesson-number", "lesson-title", "lesson-explain", "lesson-example", "lesson-task",
  "editor-gutter", "editor-highlight", "code-editor", "run-button", "check-button", "reset-button", "solution-button", "console",
  "outcome", "outcome-text", "tests", "next-button", "status"
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

const { units, limits, storageFolder, syntax, settings: { defaults } } = i18n.data;
const lessons = units.flatMap((unit) => unit.lessons.map((lesson) => ({ ...lesson, unit })));

const say = components.status(els.status);

/* ---------- the colours of the code ---------- */
// A word is a comment, a text, a number, a keyword, a value (true, null), a name that JavaScript has (console, Math), or the name of something that is called.
const WORDS = /(\/\/.*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function highlight(code) {
  let html = "";
  let last = 0;
  for (const match of code.matchAll(WORDS)) {
    const [text, comment, string, number, word] = match;
    let kind = "";
    if (comment) kind = "comment";
    else if (string) kind = "string";
    else if (number) kind = "number";
    else if (syntax.keywords.includes(word)) kind = "keyword";
    else if (syntax.literals.includes(word)) kind = "literal";
    else if (syntax.globals.includes(word)) kind = "global";
    else if (code[match.index + text.length] === "(") kind = "call";
    html += escapeHtml(code.slice(last, match.index)) + (kind ? `<span class="token-${kind}">${escapeHtml(text)}</span>` : escapeHtml(text));
    last = match.index + text.length;
  }
  return html + escapeHtml(code.slice(last));
}
// The editor is a text area over a copy of its text with the colours; the numbers of the lines are beside it.
function renderEditor() {
  const code = els.codeEditor.value;
  els.editorHighlight.innerHTML = `${highlight(code)}\n`;
  els.editorGutter.textContent = Array.from({ length: code.split("\n").length }, (item, index) => index + 1).join("\n");
}

/* ---------- the progress ---------- */
const PROGRESS_KEY = "mujs.progress";
const blank = () => ({ done: {}, code: {}, last: "", updated: 0 });
function readLocal() {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(PROGRESS_KEY)) }; } catch { return blank(); }
}
let progress = readLocal();
let preferences = settings.get("mujs", defaults);   // the size of the code text: set in the account app

function applyPreferences() {
  document.documentElement.style.setProperty("--editor-scale", String(preferences.editorScale));
}
function saveLocal() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* the progress stays in memory */ }
}
function save() {
  progress.updated = Date.now();
  saveLocal();
  scheduleUpload();
}

/* ---------- the account: the same progress on every device ---------- */
const sync = { store: null, token: "", timer: 0 };
async function openStore() {
  const signedIn = account.get();
  if (!signedIn) return null;
  if (!sync.store || sync.token !== signedIn.token) { sync.store = await storage.connect(storageFolder); sync.token = signedIn.token; }
  return sync.store;
}
function scheduleUpload() {
  clearTimeout(sync.timer);
  if (!account.get()) return;
  sync.timer = setTimeout(async () => {
    try {
      const store = await openStore();
      if (store) await storage.writeFile(store, "progress.json", JSON.stringify(progress), "muJS: save progress");
    } catch (error) { popups.toast(tr("sync.failed", { message: error.message }), { kind: "error" }); }
  }, 1500);
}
// The progress of the account and the one of this device: the newest one is kept.
async function download() {
  say(tr(account.get() ? "status.signedIn" : "status.signedOut"));
  try {
    const store = await openStore();
    if (!store) return;
    const text = await storage.readFile(store, "progress.json");
    const remote = text ? JSON.parse(text) : null;
    if (remote && remote.updated > progress.updated) {
      progress = { ...blank(), ...remote };
      saveLocal();
      openLesson(current ? current.id : startingLesson().id);
    } else if (progress.updated > (remote?.updated || 0)) scheduleUpload();
  } catch (error) { popups.toast(tr("sync.failed", { message: error.message }), { kind: "error" }); }
}

/* ---------- the sandbox: the code runs in a frame with no rights, in a worker ---------- */
let frame = null;
let frameReady = null;
let nextId = 0;
const waiting = new Map();
const sandboxText = fetch("sandbox.js", { cache: "no-store" }).then((response) => response.text());

function createFrame() {
  frame = element("iframe", "sandbox-frame");
  frame.setAttribute("sandbox", "allow-scripts");   // a page of its own: it cannot reach this page, the account, or the storage
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frameReady = new Promise((resolve) => { frame.markReady = resolve; });
  sandboxText.then((text) => {
    frame.srcdoc = `<!doctype html><script>${text.replaceAll("</script>", "<\\/script>")}</script>`;
    document.body.append(frame);
  });
}
window.addEventListener("message", (event) => {
  if (!frame || event.source !== frame.contentWindow) return;
  if (event.data?.ready) return frame.markReady();
  const done = waiting.get(event.data?.id);
  if (done) { waiting.delete(event.data.id); done(event.data); }
});
// Runs the code and the tests; a code that takes too long (a loop that never ends) is stopped by removing the frame.
async function execute(code, tests) {
  if (!frame) createFrame();
  await frameReady;
  const id = ++nextId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      frame.remove();
      frame = null;
      resolve({ id, logs: [], mark: 0, checks: [], error: null, timeout: true });
    }, limits.timeoutMs);
    waiting.set(id, (answer) => { clearTimeout(timer); resolve(answer); });
    frame.contentWindow.postMessage({ id, code, tests }, "*");
  });
}

/* ---------- the list of lessons ---------- */
const isDone = (lesson) => !!progress.done[lesson.id];
// The page opens on the lesson that was open last, or on the first one that is not done.
// The lesson that is open is also in the address (?lesson=...), so a reload opens it again (assets/js/url.js); the address wins over the last lesson of the progress.
const startingLesson = () => lessons.find((lesson) => lesson.id === urlState.get("lesson")) || lessons.find((lesson) => lesson.id === progress.last) || lessons.find((lesson) => !isDone(lesson)) || lessons[0];

let current = null;   // the lesson that is open
const menu = components.drawer({ sidebar: els.sidebar, button: els.menuButton });
function renderSidebar() {
  const done = lessons.filter(isDone).length;
  els.summaryText.textContent = tr("progress.summary", { done: i18n.number(done), total: i18n.number(lessons.length) });
  els.stepper.replaceChildren(...lessons.map((lesson) => element("div", `step${isDone(lesson) ? " done" : ""}${lesson === current ? " on" : ""}`)));
  els.sidebarNav.replaceChildren(...units.map((unit, unitIndex) => {
    const section = element("div", "unit");
    section.append(element("span", "unit-title", tr("unit.title", { number: unitIndex + 1, title: i18n.pick(unit.title) })));
    for (const lesson of lessons.filter((item) => item.unit === unit)) {
      const title = i18n.pick(lesson.title);
      const link = element("button", `sidebar-item${isDone(lesson) ? " done" : ""}${lesson === current ? " on" : ""}`);
      link.type = "button";
      link.title = tr("lesson.open", { title });
      link.setAttribute("aria-label", link.title);
      if (lesson === current) link.setAttribute("aria-current", "true");
      const badge = element("span", "sidebar-item-number");
      if (isDone(lesson)) badge.append(icon("check")); else badge.textContent = String(lessons.indexOf(lesson) + 1);
      link.append(badge, element("span", "sidebar-item-title", title));
      link.addEventListener("click", () => { menu.set(false); openLesson(lesson.id); });
      section.append(link);
    }
    return section;
  }));
}

function clearOutcome() {
  els.outcome.classList.add("hidden");
  els.nextButton.classList.add("hidden");
  els.tests.replaceChildren();
  els.console.replaceChildren(element("span", "console-empty", tr("console.empty")));
}

function openLesson(id) {
  const lesson = lessons.find((item) => item.id === id);
  if (!lesson) return;
  current = lesson;
  urlState.set({ lesson: lesson.id });
  progress.last = lesson.id;
  saveLocal();
  const index = lessons.indexOf(lesson);
  els.breadcrumbUnit.textContent = i18n.pick(lesson.unit.title);
  els.breadcrumbLesson.textContent = i18n.pick(lesson.title);
  els.lessonCounter.textContent = tr("lesson.counter", { number: index + 1, total: lessons.length });
  els.previousButton.disabled = index === 0;
  els.followingButton.disabled = index === lessons.length - 1;
  els.lessonNumber.textContent = String(index + 1);
  els.lessonTitle.textContent = i18n.pick(lesson.title);
  els.lessonExplain.replaceChildren(...i18n.pick(lesson.explain).map((paragraph) => element("span", "", paragraph)));
  els.lessonExample.innerHTML = highlight(lesson.example);
  els.lessonTask.textContent = i18n.pick(lesson.task);
  els.codeEditor.value = progress.code[lesson.id] ?? lesson.starter;
  renderEditor();
  clearOutcome();
  renderSidebar();
  els.lessonBody.scrollTop = 0;
}

let draft = 0;
els.codeEditor.addEventListener("input", () => {
  renderEditor();
  clearTimeout(draft);
  draft = setTimeout(() => {
    if (!current) return;
    progress.code[current.id] = els.codeEditor.value;
    save();
  }, 600);
});

/* ---------- running and checking ---------- */
function showConsole(answer, lines) {
  els.console.replaceChildren();
  for (const line of lines.slice(0, limits.maxLines)) els.console.append(element("span", `console-line${/^error: /.test(line) ? " error" : ""}`, line));
  if (answer.error) els.console.append(element("span", "console-line error", answer.error));
  if (!els.console.children.length) els.console.append(element("span", "console-empty", tr("console.silent")));
}

function setBusy(busy) {
  for (const button of [els.runButton, els.checkButton]) button.disabled = busy;
}

async function run(withTests) {
  if (!current) return;
  setBusy(true);
  const lesson = current;
  const code = els.codeEditor.value;
  progress.code[lesson.id] = code;
  save();
  const answer = await execute(code, withTests ? lesson.tests : []);
  setBusy(false);
  if (current !== lesson) return;
  els.outcome.classList.add("hidden");
  els.nextButton.classList.add("hidden");
  if (answer.timeout) {
    showConsole({ error: null }, []);
    return showOutcome("failed", tr("result.timeout"), []);
  }
  showConsole(answer, withTests ? answer.logs.slice(0, answer.mark) : answer.logs);
  if (!withTests) return;
  if (answer.error) return showOutcome("failed", tr("result.error"), []);
  const results = judge(lesson, answer);
  const failed = results.filter((result) => !result.ok).length;
  if (failed) return showOutcome("failed", tr("result.fail", { failed, total: results.length }), results);
  progress.done[lesson.id] = true;
  save();
  renderSidebar();
  showOutcome("passed", tr("result.pass"), results);
}

// What the code printed and what the expressions gave, against what the lesson expects.
function judge(lesson, answer) {
  const printed = answer.logs.slice(0, answer.mark);
  let next = 0;
  return lesson.tests.map((test) => {
    if (test.output) {
      const ok = printed.length === test.output.length && printed.every((line, index) => line.trim() === test.output[index]);
      return { ok, code: tr("test.output", { expected: test.output.join(" / ") }), detail: ok ? "" : tr("test.printed", { got: printed.length ? printed.join(" / ") : tr("test.nothing") }) };
    }
    const check = answer.checks[next++];
    const expected = JSON.stringify(test.expect);
    const ok = !!check && check.got === expected;
    let detail = "";
    if (!ok) detail = check?.error ? tr("test.error", { message: check.error }) : tr("test.got", { got: check?.got ?? "?" });
    return { ok, code: tr("test.expression", { expression: test.expression, expected }), detail };
  });
}

function showOutcome(kind, text, results) {
  const last = lessons.indexOf(current) === lessons.length - 1;
  els.outcome.classList.remove("hidden", "passed", "failed");
  els.outcome.classList.add(kind);
  els.outcomeText.textContent = kind === "passed" && last ? `${text} ${tr("finished")}` : text;
  els.tests.replaceChildren(...results.map((result) => {
    const row = element("div", `test ${result.ok ? "passed" : "failed"}`);
    const label = element("span", "test-text");
    label.append(element("span", "test-code", result.code));
    if (result.detail) label.append(element("span", "test-detail", ` — ${result.detail}`));
    row.append(icon(result.ok ? "check" : "close"), label);
    return row;
  }));
  els.nextButton.classList.toggle("hidden", kind !== "passed" || last);
}

els.runButton.addEventListener("click", () => run(false));
els.checkButton.addEventListener("click", () => run(true));
els.codeEditor.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); run(false); }
});
const go = (step) => { const next = lessons[lessons.indexOf(current) + step]; if (next) openLesson(next.id); };
els.nextButton.addEventListener("click", () => go(1));
els.followingButton.addEventListener("click", () => go(1));
els.previousButton.addEventListener("click", () => go(-1));

els.resetButton.addEventListener("click", async () => {
  if (!(await popups.ask({ text: tr("reset.text"), ok: tr("reset.ok") }))) return;
  delete progress.code[current.id];
  save();
  els.codeEditor.value = current.starter;
  renderEditor();
  clearOutcome();
  els.codeEditor.focus();
});
els.solutionButton.addEventListener("click", async () => {
  if (!(await popups.ask({ text: tr("solution.text"), ok: tr("solution.ok") }))) return;
  els.codeEditor.value = current.solution;
  progress.code[current.id] = current.solution;
  save();
  renderEditor();
  els.codeEditor.focus();
});

/* ---------- the list of lessons on a narrow screen, the settings, the account, and the language ---------- */
settings.onChange("mujs", defaults, (changed) => { preferences = changed; applyPreferences(); });
settings.listen("mujs", (message) => {
  if (message.type === "progressReset") { progress = blank(); openLesson(lessons[0].id); }
  else if (message.type === "reset") { preferences = settings.get("mujs", defaults); applyPreferences(); }
});
account.bind(els.accountButton);
account.onChange(() => { download(); });
i18n.onChange(() => {
  openLesson(current.id);
  say(tr(account.get() ? "status.signedIn" : "status.signedOut"));
});

applyPreferences();
openLesson(startingLesson().id);
download();
