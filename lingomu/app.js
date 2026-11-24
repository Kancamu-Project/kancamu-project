// Lingomu: short lessons that teach the words of a language. The courses, the units, the lessons, and the rules of a lesson are in data.js.
// The progress (lessons done, XP, streak) is kept in this browser, and in the lingomu folder of the storage once the user is signed in.

await i18n.load();

const { element, icon } = components;
const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "course-select", "account-button", "menu-button", "sidebar", "streak-count", "total-xp", "goal-text", "goal-fill", "sidebar-nav",
  "overview-view", "overview-number", "overview-title", "overview-unit", "overview-words", "overview-state", "start-button",
  "lesson-view", "quit-button", "lesson-fill", "hearts", "hearts-count", "exercise", "feedback", "feedback-title", "feedback-answer", "check-button",
  "result-view", "result-title", "result-lines", "result-retry-button", "result-continue-button", "status"
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

const { lesson: rules, concepts, courses, units, storageFolder, settings: { defaults } } = i18n.data;
// A word of a course is a text, or { text, roman } for a script with a reading aid (pinyin, romaji, ...): the aid is shown, and can be typed instead of the script.
const wordText = (course, id) => (typeof course.words[id] === "string" ? course.words[id] : course.words[id].text);
const wordRoman = (course, id) => (typeof course.words[id] === "string" ? "" : course.words[id].roman);
const romanOfText = (course, text) => wordRoman(course, Object.keys(course.words).find((id) => wordText(course, id) === text));
const shuffled = (list) => {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
};

const say = components.status(els.status);

/* ---------- the progress ---------- */
const PROGRESS_KEY = "lingomu.progress";
const blank = () => ({ course: "", done: {}, xp: 0, today: { date: "", xp: 0 }, streak: { days: 0, last: "" }, updated: 0 });
function readLocal() {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(PROGRESS_KEY)) }; } catch { return blank(); }
}
let progress = readLocal();
let preferences = settings.get("lingomu", defaults);   // the daily goal and the speech: set in the account app

const dayOf = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const streakNow = () => (progress.streak.last === dayOf() || progress.streak.last === dayOf(-1) ? progress.streak.days : 0);
const todayXp = () => (progress.today.date === dayOf() ? progress.today.xp : 0);

function save() {
  progress.updated = Date.now();
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* the progress stays in memory */ }
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
      if (store) await storage.writeFile(store, "progress.json", JSON.stringify(progress), "Lingomu: save progress");
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
      try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* ignore */ }
      renderAll();
    } else if (progress.updated > (remote?.updated || 0)) scheduleUpload();
  } catch (error) { popups.toast(tr("sync.failed", { message: error.message }), { kind: "error" }); }
}

/* ---------- the courses ---------- */
// Every course is offered, whatever the language of the page.
const availableCourses = () => courses;
// The course and the lesson that are shown are also in the address (?course=...&lesson=...), so a reload shows the same (assets/js/url.js); the address wins until the user chooses a course.
let courseWish = urlState.get("course");
const currentCourse = () => {
  const offered = availableCourses();
  return offered.find((course) => course.id === (courseWish || progress.course)) || offered[0];
};
function buildCourseSelect() {
  const chosen = currentCourse();
  els.courseSelect.replaceChildren(...availableCourses().map((course) => Object.assign(element("option"), { value: course.id, textContent: i18n.pick(course.name) })));
  if (chosen) els.courseSelect.value = chosen.id;
}
els.courseSelect.addEventListener("change", () => { courseWish = ""; progress.course = els.courseSelect.value; save(); selectedId = ""; renderPath(); });

/* ---------- the lessons ---------- */
const lessonsOf = () => units.flatMap((unit, unitIndex) => unit.lessons.map((lesson) => ({ ...lesson, unit, unitIndex })));
const timesDone = (course, lessonId) => progress.done[course.id]?.[lessonId] || 0;

function renderStats() {
  const goal = preferences.dailyGoal;
  const earned = todayXp();
  els.streakCount.textContent = i18n.number(streakNow());
  els.totalXp.textContent = i18n.number(progress.xp);
  els.goalText.textContent = earned >= goal ? tr("stats.goalDone") : tr("stats.goal", { xp: i18n.number(earned), goal: i18n.number(goal) });
  els.goalFill.style.width = `${Math.min(100, Math.round((earned / goal) * 100))}%`;
}

let selectedId = urlState.get("lesson");   // the lesson that the main part shows
let view = "overview";
const isLocked = (course, all, lesson) => {
  const index = all.findIndex((item) => item.id === lesson.id);
  return index > 0 && !timesDone(course, all[index - 1].id);
};

// On a narrow screen the lessons are hidden, and a button opens them over the main (Escape closes them and gives the focus back).

// Choosing a lesson in the list shows it in the main part (a lesson that is going on asks first).
async function choose(id) {
  if (view === "lesson" && !(await popups.ask({ title: tr("quit.title"), text: tr("quit.text"), ok: tr("quit.ok") }))) return;
  lesson = null;
  selectedId = id;
  menu.set(false);
  show("overview");
  renderPath();
}

const menu = components.drawer({ sidebar: els.sidebar, button: els.menuButton });
function renderSidebar(course, all) {
  els.sidebarNav.replaceChildren(...units.map((unit, unitIndex) => {
    const section = element("div", "unit");
    section.append(element("span", "unit-title", tr("unit.title", { number: unitIndex + 1, title: i18n.pick(unit.title) })));
    unit.lessons.forEach((item, lessonIndex) => {
      const done = timesDone(course, item.id);
      const locked = isLocked(course, all, item);
      const title = tr("lesson.title", { number: lessonIndex + 1 });
      const link = element("button", `sidebar-item${done ? " done" : ""}${item.id === selectedId ? " on" : ""}${locked ? " locked" : ""}`);
      link.type = "button";
      link.disabled = locked;
      link.title = locked ? tr("lesson.locked") : tr("lesson.open", { title });
      link.setAttribute("aria-label", link.title);
      if (item.id === selectedId) link.setAttribute("aria-current", "true");
      const badge = element("span", "sidebar-item-number");
      if (locked) badge.append(icon("lock")); else if (done) badge.append(icon("check")); else badge.textContent = String(lessonIndex + 1);
      link.append(badge, element("span", "sidebar-item-title", title));
      link.addEventListener("click", () => choose(item.id));
      section.append(link);
    });
    return section;
  }));
}

// The main part shows the lesson that is chosen: the words in it, and the button that starts it.
function renderOverview(course, all) {
  const item = all.find((entry) => entry.id === selectedId);
  const number = item.unit.lessons.findIndex((entry) => entry.id === item.id) + 1;
  const done = timesDone(course, item.id);
  const locked = isLocked(course, all, item);
  els.overviewNumber.textContent = String(number);
  els.overviewTitle.textContent = tr("lesson.title", { number });
  els.overviewUnit.textContent = tr("unit.title", { number: item.unitIndex + 1, title: i18n.pick(item.unit.title) });
  els.overviewWords.replaceChildren(...item.words.map((id) => {
    const row = element("div", "word-row");
    row.append(Object.assign(element("span", "word-text", wordText(course, id)), { dir: "auto" }));
    if (wordRoman(course, id)) row.append(element("span", "word-roman", wordRoman(course, id)));
    row.append(element("span", "word-meaning", meaningOf(id)));
    return row;
  }));
  els.overviewState.textContent = locked ? tr("lesson.locked") : done ? tr("lesson.done", { count: done }) : "";
  els.startButton.disabled = locked;
  els.startButton.querySelector("span").textContent = tr(done ? "lesson.practice" : "lesson.new");
  els.startButton.onclick = () => startLesson(item);
}

function renderPath() {
  renderStats();
  const course = currentCourse();
  if (!course) return els.sidebarNav.replaceChildren();
  const all = lessonsOf();
  if (!all.some((item) => item.id === selectedId)) selectedId = (all.find((item) => !timesDone(course, item.id)) || all[0]).id;
  renderSidebar(course, all);
  renderOverview(course, all);
  urlState.set({ course: course.id, lesson: selectedId });
}
function renderAll() {
  buildCourseSelect();
  renderPath();
}

/* ---------- a lesson ---------- */
const canSpeak = "speechSynthesis" in window;
function speak(text) {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = currentCourse().speech;
  speechSynthesis.speak(utterance);
}
// Marks that differ only by an accent, a capital, or punctuation do not make a typed answer wrong.
const plain = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{M}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

const sameAnswer = (a, b) => plain(a).replace(/ /g, "") === plain(b).replace(/ /g, "");

let lesson = null;   // { course, data, queue, solved, total, hearts, mistakes, current, answered, chosen }

function buildQueue(course, data) {
  const ids = data.words;
  const of = (kind) => shuffled(ids).map((id) => ({ kind, id }));
  const listening = canSpeak && preferences.speak ? of(rules.listenKind) : [];
  return [...of("meaning"), ...of("word"), { kind: rules.matchKind, ids }, ...shuffled([...of("type"), ...listening])];
}
// The right answer and some wrong ones (words of the course that are not the right one), in a random order.
function choicesFor(course, id, textOf) {
  const right = textOf(id);
  const others = shuffled(Object.keys(course.words).filter((other) => other !== id && textOf(other) !== right)).slice(0, rules.choices - 1).map(textOf);
  return shuffled([right, ...others]);
}
const meaningOf = (id) => i18n.pick(concepts[id]);

function startLesson(data) {
  const course = currentCourse();
  const queue = buildQueue(course, data);
  lesson = { course, data, queue, solved: 0, total: queue.length, hearts: rules.hearts, mistakes: 0, current: null, answered: false, chosen: null };
  show("lesson");
  nextExercise();
}
function show(name) {
  view = name;
  els.overviewView.classList.toggle("hidden", name !== "overview");
  els.lessonView.classList.toggle("hidden", name !== "lesson");
  els.resultView.classList.toggle("hidden", name !== "result");
}
function renderHearts() {
  els.heartsCount.textContent = String(lesson.hearts);
  els.hearts.setAttribute("aria-label", tr("hearts.label", { count: lesson.hearts }));
  els.lessonFill.style.width = `${Math.round((lesson.solved / lesson.total) * 100)}%`;
}

function nextExercise() {
  if (!lesson.queue.length) return finishLesson();
  lesson.current = lesson.queue.shift();
  lesson.answered = false;
  lesson.chosen = null;
  els.feedback.classList.add("hidden");
  els.checkButton.querySelector("span").textContent = tr("check");
  els.checkButton.disabled = true;
  els.checkButton.classList.remove("hidden");
  renderHearts();
  renderExercise();
}

function speakButton(text) {
  const button = element("button", "ghost square");
  button.type = "button";
  button.title = tr("speak");
  button.setAttribute("aria-label", tr("speak"));
  button.append(icon("volume"));
  button.addEventListener("click", () => speak(text));
  return button;
}
function choiceButton(text, index, onChoose, roman = "") {
  const button = element("button", "choice");
  button.type = "button";
  button.dataset.value = text;
  const label = Object.assign(element("span", "choice-text", text), { dir: "auto" });
  if (roman) label.append(element("span", "choice-roman", roman));
  button.append(element("span", "choice-key", String(index + 1)), label);
  button.addEventListener("click", () => onChoose(button));
  return button;
}

function renderExercise() {
  const { course, current } = lesson;
  const language = i18n.pick(course.name);
  const parts = [];
  lesson.shown = "";
  if (current.kind === rules.matchKind) return renderMatch(language);
  const word = wordText(course, current.id);
  const roman = wordRoman(course, current.id);
  if (current.kind === "meaning") {
    parts.push(element("span", "exercise-prompt", tr("prompt.meaning")));
    const shown = element("div", "exercise-word");
    shown.append(Object.assign(element("span", "", word), { dir: "auto" }));
    if (canSpeak) shown.append(speakButton(word));
    parts.push(shown, ...(roman ? [element("span", "exercise-roman", roman)] : []), choiceList(choicesFor(course, current.id, meaningOf), meaningOf(current.id)));
    if (preferences.speak) speak(word);
  } else if (current.kind === "word") {
    parts.push(element("span", "exercise-prompt", tr("prompt.word", { language })), element("div", "exercise-word", meaningOf(current.id)));
    lesson.shown = roman ? `${word} (${roman})` : word;
    parts.push(choiceList(choicesFor(course, current.id, (id) => wordText(course, id)), word, (text) => romanOfText(course, text)));
  } else if (current.kind === rules.listenKind) {
    parts.push(element("span", "exercise-prompt", tr("prompt.listen")));
    const shown = element("div", "exercise-word");
    shown.append(speakButton(word));
    lesson.shown = roman ? `${word} (${roman})` : word;
    parts.push(shown, choiceList(choicesFor(course, current.id, (id) => wordText(course, id)), word, (text) => romanOfText(course, text)));
    speak(word);
  } else {
    parts.push(element("span", "exercise-prompt", tr("prompt.type", { language })), element("div", "exercise-word", meaningOf(current.id)));
    const input = element("input", "type-input");
    input.type = "text";
    input.dir = "auto";
    input.autocomplete = "off";
    input.setAttribute("autocapitalize", "off");
    input.spellcheck = false;
    input.placeholder = tr("type.placeholder");
    input.setAttribute("aria-label", tr("type.placeholder"));
    input.addEventListener("input", () => { lesson.chosen = input.value; els.checkButton.disabled = !plain(input.value); });
    parts.push(input);
    if (roman) parts.push(element("span", "exercise-hint", tr("type.hint")));
    lesson.correct = word;
    lesson.accepted = [word, roman].filter(Boolean);
    lesson.shown = roman ? `${word} (${roman})` : word;
  }
  els.exercise.replaceChildren(...parts);
  (els.exercise.querySelector(".type-input") || els.exercise.querySelector(".choice"))?.focus();
}
function choiceList(options, right, romanOf = () => "") {
  lesson.correct = right;
  const list = element("div", "choices");
  list.setAttribute("role", "group");
  list.append(...options.map((option, index) => choiceButton(option, index, (button) => {
    if (lesson.answered) return;
    lesson.chosen = option;
    list.querySelectorAll(".choice").forEach((other) => other.classList.toggle("on", other === button));
    els.checkButton.disabled = false;
  }, romanOf(option))));
  return list;
}

/* ---------- the pairs: a word of the course on one side, its meaning on the other ---------- */
function renderMatch() {
  const { course, current } = lesson;
  const pairing = { picked: { word: null, meaning: null }, matched: new Set() };
  lesson.pairing = pairing;
  const column = (side, text, aid = () => "") => {
    const box = element("div", "match-column");
    box.append(...shuffled(current.ids).map((id, index) => {
      const button = choiceButton(text(id), index, () => pick(side, id, button), aid(id));
      button.dataset.id = id;
      return button;
    }));
    return box;
  };
  const columns = element("div", "match-columns");
  columns.append(column("word", (id) => wordText(course, id), (id) => wordRoman(course, id)), column("meaning", meaningOf));
  els.exercise.replaceChildren(element("span", "exercise-prompt", tr("prompt.match")), columns);
  els.checkButton.classList.add("hidden");
  els.exercise.querySelector(".choice")?.focus();
}
function pick(side, id, button) {
  const pairing = lesson.pairing;
  if (lesson.answered || pairing.matched.has(id)) return;
  const previous = pairing.picked[side];
  if (previous) previous.button.classList.remove("on");
  pairing.picked[side] = { id, button };
  button.classList.add("on");
  const { word, meaning } = pairing.picked;
  if (!word || !meaning) return;
  pairing.picked = { word: null, meaning: null };
  const buttons = [word.button, meaning.button];
  if (word.id === meaning.id) {
    pairing.matched.add(word.id);
    buttons.forEach((each) => { each.classList.remove("on"); each.classList.add("right", "matched"); each.disabled = true; });
    if (pairing.matched.size === lesson.current.ids.length) answered(true, "");
  } else {
    buttons.forEach((each) => { each.classList.remove("on"); each.classList.add("wrong"); });
    setTimeout(() => buttons.forEach((each) => each.classList.remove("wrong")), 600);
    loseHeart(true);
  }
}

/* ---------- checking an answer ---------- */
// A heart is lost for a wrong answer; with none left, the lesson ends (after the answer was shown, or at once while pairing).
function loseHeart(immediately = false) {
  lesson.hearts--;
  lesson.mistakes++;
  renderHearts();
  if (immediately && lesson.hearts <= 0) failLesson();
}
function checkAnswer() {
  if (lesson.answered) return lesson.hearts <= 0 ? failLesson() : nextExercise();
  const { current } = lesson;
  const typed = current.kind === "type";
  const right = typed ? lesson.accepted.some((accepted) => sameAnswer(lesson.chosen || "", accepted)) : lesson.chosen === lesson.correct;
  els.exercise.querySelectorAll(".choice").forEach((button) => {
    button.disabled = true;
    button.classList.remove("on");
    if (button.dataset.value === lesson.correct) button.classList.add("right");
    else if (button.dataset.value === lesson.chosen) button.classList.add("wrong");
  });
  const input = els.exercise.querySelector(".type-input");
  if (input) input.disabled = true;
  if (!right) lesson.queue.push(current);   // a wrong answer comes back at the end
  answered(right, lesson.shown || lesson.correct);
  if (!right) loseHeart();
}
function answered(right, answer) {
  lesson.answered = true;
  if (right) lesson.solved++;
  renderHearts();
  els.feedback.classList.remove("hidden");
  els.feedback.classList.toggle("right", right);
  els.feedback.classList.toggle("wrong", !right);
  els.feedbackTitle.textContent = tr(right ? "feedback.correct" : "feedback.wrong");
  els.feedbackAnswer.textContent = right || !answer ? "" : tr("feedback.answer", { answer });
  els.checkButton.classList.remove("hidden");
  els.checkButton.disabled = false;
  els.checkButton.querySelector("span").textContent = tr("continue");
  els.checkButton.focus();
}
els.checkButton.addEventListener("click", checkAnswer);

document.addEventListener("keydown", (event) => {
  if (!lesson || els.lessonView.classList.contains("hidden") || event.ctrlKey || event.metaKey || event.altKey) return;
  const typing = event.target instanceof HTMLInputElement;
  if (event.key === "Enter" && (typing || event.target === document.body) && !els.checkButton.disabled && !els.checkButton.classList.contains("hidden")) {
    event.preventDefault();
    checkAnswer();
  } else if (!typing && /^[1-9]$/.test(event.key)) {
    const options = [...els.exercise.querySelectorAll(".choice")].filter((button) => !button.disabled);
    options[Number(event.key) - 1]?.click();
  }
});

/* ---------- the end of a lesson ---------- */
function showResult({ title, lines, continueText, retry }) {
  els.resultTitle.textContent = title;
  els.resultLines.replaceChildren(...lines);
  els.resultContinueButton.querySelector("span").textContent = continueText;
  els.resultRetryButton.classList.toggle("hidden", !retry);
  show("result");
  (retry ? els.resultRetryButton : els.resultContinueButton).focus();
}
const resultLine = (iconName, text) => {
  const line = element("div", "result-line");
  line.append(icon(iconName), element("span", "", text));
  return line;
};

function finishLesson() {
  const { course, data } = lesson;
  const xp = rules.xp + (lesson.mistakes === 0 ? rules.perfectBonus : 0);
  const today = dayOf();
  progress.xp += xp;
  progress.today = { date: today, xp: todayXp() + xp };
  if (progress.streak.last !== today) progress.streak = { days: progress.streak.last === dayOf(-1) ? progress.streak.days + 1 : 1, last: today };
  progress.course = course.id;
  progress.done[course.id] = { ...progress.done[course.id], [data.id]: timesDone(course, data.id) + 1 };
  save();
  const percent = Math.round((lesson.total / (lesson.total + lesson.mistakes)) * 100);
  showResult({
    title: tr("result.title"),
    lines: [resultLine("star", tr("result.xp", { xp })), resultLine("check", tr("result.accuracy", { percent })), resultLine("zap", tr("result.streak", { count: streakNow() }))],
    continueText: tr("continue"),
    retry: false,
  });
}
function failLesson() {
  const data = lesson.data;
  showResult({
    title: tr("failed.title"),
    lines: [element("span", "", tr("failed.text"))],
    continueText: tr("failed.leave"),
    retry: true,
  });
  lesson = { ...lesson, retry: data };
}
els.resultContinueButton.addEventListener("click", () => {
  // after a lesson that was done, the next one is shown
  const all = lessonsOf();
  const finished = lesson?.retry ? -1 : all.findIndex((item) => item.id === lesson?.data.id);
  if (finished >= 0 && all[finished + 1]) selectedId = all[finished + 1].id;
  lesson = null;
  show("overview");
  renderPath();
});
els.resultRetryButton.addEventListener("click", () => lesson?.retry && startLesson(lesson.retry));

els.quitButton.addEventListener("click", async () => {
  if (!(await popups.ask({ title: tr("quit.title"), text: tr("quit.text"), ok: tr("quit.ok") }))) return;
  lesson = null;
  show("overview");
  renderPath();
});

/* ---------- the settings, the account, and the language ---------- */
settings.onChange("lingomu", defaults, (changed) => { preferences = changed; renderStats(); });
settings.listen("lingomu", (message) => {
  if (message.type === "progressReset") { progress = blank(); renderAll(); }
  else if (message.type === "reset") { preferences = settings.get("lingomu", defaults); renderStats(); }
});
account.bind(els.accountButton);
account.onChange(() => { download(); });
i18n.onChange(() => { renderAll(); say(tr(account.get() ? "status.signedIn" : "status.signedOut")); });

renderAll();
show("overview");
download();
