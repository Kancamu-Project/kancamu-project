import { i18n, popups, account, urlState, autocomplete, components } from "../assets/js/shared.js";
import appData from "./data.js";

await i18n.load(appData);
i18n.selects();

const { element, icon } = components;
const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "header", "sidebar", "sidebar-nav", "menu-button", "account-button", "back-button", "view-title", "post-search", "refresh-button", "timeline",
  "profile-card", "composer", "composer-avatar", "composer-text", "composer-counter", "composer-button", "composer-button-text",
  "signin-row", "signin-button", "people", "post-list", "empty-state", "more-button", "status",
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

const api = location.hostname === "localhost" ? i18n.data.api.local : i18n.data.api.production;
const SESSION_KEY = "guyonmu.session";
const SEARCH_DELAY = 300;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const TOKEN = /(https?:\/\/[^\s<>"']+)|(@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))|(#[\p{L}\p{N}_]+)/gu;
const TRAILING = /[.,;:!?)\]]+$/;

const state = {
  config: null,
  me: null,
  view: { kind: "home" },
  posts: [],
  next: null,
  root: null,
  profile: null,
  people: [],
  loading: true,
  failed: false,
  missing: false,
  sending: false,
};
const trail = [];
const known = new Map();

const failure = (code, status) => Object.assign(new Error(code), { code, status });
const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const writeSession = (value) => {
  try { if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value)); else localStorage.removeItem(SESSION_KEY); } catch {}
};

async function send(method, path, body, session) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (session) headers.Authorization = `Bearer ${session}`;
  let response;
  try {
    response = await fetch(api + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw failure("network", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw failure(data?.error || "generic", response.status);
  return data;
}

let opening = null;
function sessionToken() {
  const signedIn = account.get();
  if (!signedIn) {
    writeSession(null);
    state.me = null;
    return Promise.resolve(null);
  }
  const saved = readSession();
  if (saved && saved.login === signedIn.login && saved.expires > Date.now() + MINUTE) {
    state.me ??= saved.user;
    return Promise.resolve(saved.session);
  }
  opening ??= send("POST", "/session", { token: signedIn.token })
    .then((result) => {
      writeSession({ session: result.session, expires: result.expires, login: signedIn.login, user: result.user });
      state.me = result.user;
      return result.session;
    })
    .finally(() => { opening = null; });
  return opening;
}

async function request(method, path, body, retry = true) {
  let session;
  try {
    session = await sessionToken();
  } catch (error) {
    if (error.code === "github") {
      popups.toast(tr("acct.tokenInvalid", { name: account.get()?.login || tr("acct.anAccount") }), { kind: "error" });
      account.signOut();
      error.handled = true;
    }
    throw error;
  }
  try {
    return await send(method, path, body, session);
  } catch (error) {
    if (error.status === 401 && session && retry) {
      writeSession(null);
      state.me = null;
      return request(method, path, body, false);
    }
    throw error;
  }
}

function report(error) {
  if (error.handled) return;
  const key = `error.${error.code}`;
  popups.toast(i18n.ui[key] ? tr(key) : tr("error.generic"), { kind: "error" });
}

const viewOf = () => {
  if (urlState.get("post")) return { kind: "thread", id: urlState.get("post") };
  if (urlState.get("user")) return { kind: "profile", login: urlState.get("user") };
  if (urlState.get("q")) return { kind: "search", query: urlState.get("q") };
  return { kind: urlState.get("tab") === "following" ? "following" : "home" };
};
const currentAddress = () => ({ tab: urlState.get("tab"), user: urlState.get("user"), post: urlState.get("post"), q: urlState.get("q") });

function go(next, { remember = true } = {}) {
  if (remember) trail.push(currentAddress());
  urlState.set({ tab: "", user: "", post: "", q: "", ...next });
  els.postSearch.value = urlState.get("q");
  els.composerText.value = "";
  load();
}
function goBack() {
  const previous = trail.pop() ?? {};
  go(previous, { remember: false });
}

let generation = 0;
async function load({ append = false } = {}) {
  const mine = ++generation;
  const view = viewOf();
  state.view = view;
  if (!append) {
    Object.assign(state, { loading: true, failed: false, missing: false, posts: [], next: null, root: null, profile: null, people: [] });
    render();
  }
  try {
    state.config ??= await request("GET", "/config");
    await fetchView(view, append, mine);
  } catch (error) {
    if (mine !== generation) return;
    if (error.status === 404 && (view.kind === "profile" || view.kind === "thread")) state.missing = true;
    else { state.failed = true; report(error); }
  }
  if (mine !== generation) return;
  state.loading = false;
  render();
}

async function fetchView(view, append, mine) {
  const list = async (params) => {
    const query = new URLSearchParams(params);
    if (append && state.next) query.set("cursor", state.next);
    const page = await request("GET", `/posts?${query}`);
    if (mine !== generation) return;
    state.posts = append ? [...state.posts, ...page.posts] : page.posts;
    state.next = page.next;
  };
  if (view.kind === "following" && !account.get()) return;
  if (view.kind === "home") return list({});
  if (view.kind === "following") return list({ feed: "following" });
  if (view.kind === "profile") {
    const jobs = [list({ user: view.login })];
    if (!append) jobs.push(request("GET", `/users/${encodeURIComponent(view.login)}`).then((profile) => { if (mine === generation) state.profile = profile; }));
    return Promise.all(jobs);
  }
  if (view.kind === "thread") {
    const jobs = [list({ parent: view.id })];
    if (!append) jobs.push(request("GET", `/posts/${encodeURIComponent(view.id)}`).then((root) => { if (mine === generation) state.root = root; }));
    return Promise.all(jobs);
  }
  const jobs = [list({ q: view.query })];
  if (!append) jobs.push(request("GET", `/users?q=${encodeURIComponent(view.query)}`).then((result) => { if (mine === generation) state.people = result.users; }));
  return Promise.all(jobs);
}

function ago(time) {
  const elapsed = Date.now() - time;
  if (elapsed < MINUTE) return tr("time.now");
  const relative = new Intl.RelativeTimeFormat(i18n.lang, { style: "narrow", numeric: "always" });
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  if (elapsed < WEEK) return relative.format(-Math.floor(elapsed / DAY), "day");
  const sameYear = new Date(time).getFullYear() === new Date().getFullYear();
  return i18n.date(time, { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
}
const fullDate = (time) => new Intl.DateTimeFormat(i18n.lang, { dateStyle: "medium", timeStyle: "short" }).format(time);

const profileAddress = (login) => `?user=${encodeURIComponent(login)}`;
function link(className, href, text, onGo) {
  const anchor = element("a", className, text);
  anchor.href = href;
  anchor.addEventListener("click", (event) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    onGo();
  });
  return anchor;
}

function richText(text) {
  const fragment = document.createDocumentFragment();
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    let [token] = match;
    if (match[1]) token = token.replace(TRAILING, "");
    if (match.index > last) fragment.append(text.slice(last, match.index));
    if (match[1]) {
      const anchor = element("a", "post-link", token);
      anchor.href = token;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer nofollow ugc";
      anchor.addEventListener("click", (event) => event.stopPropagation());
      fragment.append(anchor);
    } else if (match[2]) {
      fragment.append(link("post-mention", profileAddress(token.slice(1)), token, () => go({ user: token.slice(1) })));
    } else {
      fragment.append(link("post-tag", `?q=${encodeURIComponent(token)}`, token, () => go({ q: token })));
    }
    last = match.index + token.length;
  }
  if (last < text.length) fragment.append(text.slice(last));
  return fragment;
}

function setAvatar(node, user) {
  node.style.backgroundImage = user.avatar ? `url(${JSON.stringify(user.avatar)})` : "";
  node.textContent = user.avatar ? "" : (user.name || user.login).slice(0, 1).toUpperCase();
}
function avatarLink(user) {
  const anchor = link("avatar", profileAddress(user.login), "", () => go({ user: user.login }));
  anchor.setAttribute("aria-label", tr("post.profile", { name: user.name }));
  setAvatar(anchor, user);
  return anchor;
}

function actionButton(className, iconName, label, count, focusKey, onClick) {
  const button = element("button", `ghost ${className}`);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.dataset.focusKey = focusKey;
  button.append(icon(iconName));
  if (count) button.append(element("span", "count", i18n.number(count)));
  button.addEventListener("click", (event) => { event.stopPropagation(); onClick(button); });
  return button;
}

function makePost(post, { root = false } = {}) {
  known.set(post.user.login, post.user.name);
  const card = element("div", root ? "post root" : "post");
  card.dataset.id = post.id;
  const content = element("div", "post-content");
  const head = element("div", "post-head");
  const name = link("post-name", profileAddress(post.user.login), post.user.name, () => go({ user: post.user.login }));
  const time = element("span", "post-time", ago(post.createdAt));
  time.title = fullDate(post.createdAt);
  head.append(name, element("span", "post-login", `@${post.user.login}`), time);
  const body = element("div", "post-body selectable");
  body.append(richText(post.body));
  const actions = element("div", "post-actions");
  actions.append(
    actionButton("reply", "message", tr("post.reply"), post.replies, `reply-${post.id}`, () => { go({ post: post.id }); els.composerText.focus(); }),
    actionButton(post.liked ? "like on" : "like", "heart", tr(post.liked ? "post.unlike" : "post.like"), post.likes, `like-${post.id}`, () => toggleLike(post)),
  );
  if (post.own) actions.append(actionButton("delete", "trash", tr("post.delete"), 0, `delete-${post.id}`, () => removePost(post)));
  content.append(head, body, actions);
  card.append(avatarLink(post.user), content);
  if (!root) {
    card.tabIndex = 0;
    const open = () => go({ post: post.id });
    card.addEventListener("click", () => { if (!getSelection().toString()) open(); });
    card.addEventListener("keydown", (event) => { if (event.target === card && event.key === "Enter") open(); });
  }
  return card;
}

function replacePost(updated) {
  state.posts = state.posts.map((post) => (post.id === updated.id ? updated : post));
  if (state.root?.id === updated.id) state.root = updated;
}

async function toggleLike(post) {
  if (!account.get()) return account.open();
  try {
    replacePost(await request(post.liked ? "DELETE" : "PUT", `/posts/${post.id}/like`));
  } catch (error) { report(error); }
  render();
}

async function removePost(post) {
  const confirmed = await popups.ask({ text: tr("post.deleteConfirm"), ok: tr("post.deleteOk") });
  if (!confirmed) return;
  try {
    await request("DELETE", `/posts/${post.id}`);
  } catch (error) { return report(error); }
  popups.toast(tr("post.deleted"), { kind: "success" });
  if (state.root?.id === post.id) return goBack();
  state.posts = state.posts.filter((item) => item.id !== post.id);
  if (state.root) state.root = { ...state.root, replies: Math.max(0, state.root.replies - 1) };
  render();
}

function composerLength() { return [...els.composerText.value.trim()].length; }
function updateComposer() {
  const length = composerLength();
  const max = state.config?.postMax ?? 0;
  els.composerCounter.textContent = max ? tr("compose.counter", { count: i18n.number(length), max: i18n.number(max) }) : "";
  els.composerCounter.classList.toggle("over", max > 0 && length > max);
  els.composerButton.disabled = !length || (max > 0 && length > max) || state.sending;
}

async function publish() {
  if (els.composerButton.disabled) return;
  const thread = state.view.kind === "thread";
  state.sending = true;
  updateComposer();
  try {
    const post = await request("POST", "/posts", { body: els.composerText.value, parentId: thread ? Number(state.view.id) : null });
    els.composerText.value = "";
    if (thread) {
      state.posts = [...state.posts, post];
      state.root = { ...state.root, replies: state.root.replies + 1 };
    } else state.posts = [post, ...state.posts];
    popups.toast(tr(thread ? "post.replied" : "post.posted"), { kind: "success" });
  } catch (error) { report(error); }
  state.sending = false;
  render();
}

async function toggleFollow() {
  if (!account.get()) return account.open();
  const profile = state.profile;
  try {
    state.profile = await request(profile.followed ? "DELETE" : "PUT", `/users/${encodeURIComponent(profile.login)}/follow`);
  } catch (error) { report(error); }
  render();
}

async function editBio() {
  const value = await popups.ask({ text: tr("profile.bioPrompt"), value: state.profile.bio });
  if (value === null) return;
  try {
    state.profile = await request("PATCH", "/me", { bio: value });
    popups.toast(tr("profile.bioSaved"), { kind: "success" });
  } catch (error) { report(error); }
  render();
}

async function deleteData() {
  const confirmed = await popups.ask({ text: tr("profile.deleteDataConfirm"), ok: tr("profile.deleteDataOk") });
  if (!confirmed) return;
  try {
    await request("DELETE", "/me");
  } catch (error) { return report(error); }
  writeSession(null);
  state.me = null;
  popups.toast(tr("profile.dataDeleted"), { kind: "success" });
  go({}, { remember: false });
}

function textButton(label, onClick, className = "") {
  const button = element("button", className);
  button.type = "button";
  button.append(element("span", "", label));
  button.addEventListener("click", onClick);
  return button;
}

function renderProfile() {
  const profile = state.profile;
  const card = els.profileCard;
  card.classList.toggle("hidden", !profile);
  if (!profile) return;
  const avatar = element("div", "avatar large");
  setAvatar(avatar, profile);
  const details = element("div", "profile-details");
  const bio = element("div", profile.bio ? "profile-bio selectable" : "profile-bio empty", profile.bio || tr("profile.noBio"));
  const counts = element("div", "profile-counts");
  counts.append(
    element("span", "", tr("profile.posts", { count: i18n.number(profile.posts) })),
    element("span", "", tr("profile.followers", { count: i18n.number(profile.followers) })),
    element("span", "", tr("profile.following", { count: i18n.number(profile.following) })),
    element("span", "", tr("profile.joined", { date: i18n.date(profile.createdAt, { month: "long", year: "numeric" }) })),
  );
  const actions = element("div", "profile-actions");
  if (profile.own) actions.append(textButton(tr("profile.edit"), editBio), textButton(tr("profile.deleteData"), deleteData, "wide danger"));
  else actions.append(textButton(tr(profile.followed ? "profile.unfollow" : "profile.follow"), toggleFollow, profile.followed ? "" : "primary"));
  details.append(element("span", "profile-name", profile.name), element("span", "profile-login", `@${profile.login}`), bio, counts, actions);
  card.replaceChildren(avatar, details);
}

function renderPeople() {
  const people = state.view.kind === "search" ? state.people : [];
  els.people.classList.toggle("hidden", !people.length);
  const list = element("div", "people-list");
  for (const person of people) {
    known.set(person.login, person.name);
    const chip = link("person", profileAddress(person.login), "", () => go({ user: person.login }));
    const avatar = element("span", "avatar");
    setAvatar(avatar, person);
    chip.append(avatar, element("span", "person-name", `${person.name} @${person.login}`));
    list.append(chip);
  }
  els.people.replaceChildren(element("span", "people-title", tr("people.title")), list);
}

function renderSidebar() {
  const signedIn = !!account.get();
  const kind = state.view.kind;
  const own = state.me && state.view.kind === "profile" && state.view.login.toLowerCase() === state.me.login.toLowerCase();
  const item = (id, iconName, label, on, onClick) => {
    const button = element("button", `sidebar-item${on ? " on" : ""}`);
    button.type = "button";
    button.dataset.focusKey = `nav-${id}`;
    button.append(icon(iconName), element("span", "sidebar-item-title", label));
    button.addEventListener("click", () => { menu.set(false); onClick(); });
    return button;
  };
  els.sidebarNav.replaceChildren(
    item("home", "home", tr("nav.home"), kind === "home", () => go({})),
    item("following", "list", tr("nav.following"), kind === "following", () => go({ tab: "following" })),
    item("profile", "user", tr("nav.profile"), !!own, () => (signedIn && state.me ? go({ user: state.me.login }) : account.open())),
  );
}

function emptyMessage() {
  const { kind } = state.view;
  if (state.loading) return [tr("loading"), ""];
  if (state.failed) return [tr("error.generic"), ""];
  if (kind === "following" && !account.get()) return [tr("empty.followingSignedOut"), tr("compose.signIn")];
  if (state.missing) return kind === "profile" ? [tr("profile.notFound"), ""] : [tr("post.notFound"), ""];
  if (kind === "following") return [tr("empty.followingTitle"), tr("empty.followingText")];
  if (kind === "search") return [tr("empty.searchTitle"), tr("empty.searchText", { query: state.view.query })];
  if (kind === "profile") return [tr("empty.profileTitle"), tr("empty.profileText", { name: state.profile?.name ?? state.view.login })];
  if (kind === "thread") return [tr("empty.repliesTitle"), tr("empty.repliesText")];
  return [tr("empty.homeTitle"), tr("empty.homeText")];
}

function titleOf() {
  const view = state.view;
  if (view.kind === "search") return tr("title.search", { query: view.query });
  if (view.kind === "profile") return tr("title.profile", { name: state.profile?.name ?? view.login });
  return tr(`title.${view.kind}`);
}

function render() {
  const keep = document.activeElement?.dataset?.focusKey;
  const { kind } = state.view;
  const signedIn = !!account.get();
  const thread = kind === "thread";
  const writable = signedIn && (kind === "home" || (thread && state.root));

  els.viewTitle.textContent = titleOf();
  els.backButton.classList.toggle("hidden", kind === "home" || kind === "following");
  els.refreshButton.disabled = state.loading;

  renderProfile();
  renderPeople();
  renderSidebar();

  els.composer.classList.toggle("hidden", !writable);
  els.signinRow.classList.toggle("hidden", signedIn || kind === "following" || kind === "search");
  if (writable) {
    els.composerText.placeholder = tr(thread ? "compose.replyPlaceholder" : "compose.placeholder");
    els.composerButtonText.textContent = tr(thread ? "compose.reply" : "compose.post");
    if (state.me) setAvatar(els.composerAvatar, state.me);
    else setAvatar(els.composerAvatar, account.get() ?? { name: "?" });
    updateComposer();
  }

  const cards = [];
  if (thread && state.root) cards.push(makePost(state.root, { root: true }));
  cards.push(...state.posts.map((post) => makePost(post)));
  els.postList.replaceChildren(...cards);

  const hasContent = cards.length > (thread && state.root ? 1 : 0);
  const showEmpty = state.loading ? !cards.length : !hasContent;
  els.emptyState.classList.toggle("hidden", !showEmpty);
  if (showEmpty) {
    const [heading, text] = emptyMessage();
    els.emptyState.heading = heading;
    els.emptyState.text = text;
  }
  els.moreButton.classList.toggle("hidden", !state.next || state.loading);

  els.status.textContent = signedIn && state.me ? tr("status.signedIn", { login: state.me.login }) : tr("status.signedOut");
  if (keep) els.timeline.querySelector(`[data-focus-key="${keep}"]`)?.focus();
}

const menu = components.drawer({ sidebar: els.sidebar, button: els.menuButton });

els.backButton.addEventListener("click", goBack);
els.refreshButton.addEventListener("click", () => load());
els.moreButton.addEventListener("click", () => { els.moreButton.disabled = true; load({ append: true }).finally(() => { els.moreButton.disabled = false; }); });
els.composerText.addEventListener("input", updateComposer);
els.composerText.addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); publish(); } });
els.composerButton.addEventListener("click", publish);
els.signinButton.addEventListener("click", () => account.open());

let searchTimer = 0;
els.postSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const query = els.postSearch.value.trim();
    const searching = viewOf().kind === "search";
    if (query === urlState.get("q")) return;
    go(query ? { q: query } : {}, { remember: !searching && !!query });
  }, SEARCH_DELAY);
});
autocomplete.attach(els.postSearch, { suggestions: () => [...known].flatMap(([login, name]) => [`@${login}`, name]) });

account.bind(els.accountButton);
account.onChange((signedIn) => {
  if (!signedIn) { writeSession(null); state.me = null; }
  load();
});
i18n.onChange(() => render());

els.postSearch.value = urlState.get("q");
load();
