import { i18n, popups, account, urlState, autocomplete, components } from "../assets/js/shared.js";
import appData from "./data.js";

await i18n.load(appData);
i18n.selects();

const { element, icon } = components;
const tr = (key, params) => i18n.t(key, params);
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "header", "sidebar", "sidebar-nav", "menu-button", "account-button", "back-button", "view-title", "post-search", "refresh-button", "timeline",
  "feed-tabs", "compose-title", "dialog-button-text", "image-dialog", "image-close-button", "image-view", "composer-images", "composer-image-button", "composer-image-input", "dialog-images", "dialog-image-button", "dialog-image-input", "new-post-button", "compose-dialog", "compose-close-button", "dialog-avatar", "dialog-text", "dialog-counter", "dialog-button", "profile-card", "feed", "root-post", "composer", "composer-avatar", "composer-text", "composer-counter", "composer-button", "composer-button-text",
  "signin-row", "signin-button", "people", "post-list", "empty-state", "more-button", "status",
].map((id) => [id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), $(id)]));

const api = location.hostname === "localhost" ? i18n.data.api.local : i18n.data.api.production;
const SESSION_KEY = "guyonmu.session";
const SEARCH_DELAY = 300;
const IMAGE_QUALITY = 0.85;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const TOKEN = /(https?:\/\/[^\s<>"']+)|(@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))|(#[\p{L}\p{N}_]+)/gu;
const TRAILING = /[.,;:!?)\]]+$/;

const state = {
  config: null,
  view: { kind: "home" },
  posts: [],
  next: null,
  root: null,
  profile: null,
  people: [],
  groups: [],
  entries: [],
  counts: {},
  loading: true,
  failed: false,
  missing: false,
  sending: false,
};
const composers = {};
const isModerator = () => !!(savedSession() && readSession()?.moderator);
const pageOf = (id) => i18n.data.pages.find((page) => page.id === id && (!page.moderator || isModerator()));
const feedOf = (id) => i18n.data.feeds.find((feed) => feed.id === id);
const trail = [];
const known = new Map();

const failure = (code, status) => Object.assign(new Error(code), { code, status });
const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const writeSession = (value) => {
  try { if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value)); else if (localStorage.getItem(SESSION_KEY)) localStorage.removeItem(SESSION_KEY); } catch {}
};
const same = (login) => !!login && login.toLowerCase() === account.get()?.login.toLowerCase();

async function send(method, path, body, session) {
  const headers = {};
  const file = body instanceof Blob;
  if (body) headers["Content-Type"] = file ? body.type : "application/json";
  if (session) headers.Authorization = `Bearer ${session}`;
  let response;
  try {
    response = await fetch(api + path, { method, headers, body: file ? body : body ? JSON.stringify(body) : undefined });
  } catch {
    throw failure("network", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw failure(data?.error || "generic", response.status);
  return data;
}

function savedSession() {
  const signedIn = account.get();
  const saved = readSession();
  return signedIn && saved && saved.login === signedIn.login && saved.expires > Date.now() + MINUTE ? saved.session : null;
}

let opening = null;
function openSession() {
  const signedIn = account.get();
  if (!signedIn) return Promise.resolve(null);
  const saved = savedSession();
  if (saved) return Promise.resolve(saved);
  opening ??= send("POST", "/session", { token: signedIn.token })
    .then((result) => {
      writeSession({ session: result.session, expires: result.expires, login: signedIn.login, moderator: result.moderator });
      return result.session;
    })
    .finally(() => { opening = null; });
  return opening;
}

async function request(method, path, body, { write = false, retry = true } = {}) {
  let session = null;
  try {
    session = write ? await openSession() : savedSession();
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
      return request(method, path, body, { write, retry: false });
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
  const tab = urlState.get("tab");
  return { kind: feedOf(tab) || pageOf(tab) ? tab : "home" };
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
    Object.assign(state, { loading: true, failed: false, missing: false, posts: [], next: null, root: null, profile: null, people: [], groups: [], entries: [] });
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
    const page = await request("GET", `/posts?${query}`, null, { write: !!params.feed });
    if (mine !== generation) return;
    state.posts = append ? [...state.posts, ...page.posts] : page.posts;
    state.next = page.next;
  };
  const page = pageOf(view.kind);
  if ((feedOf(view.kind) || page) && !account.get()) return;
  if (page) {
    const data = await request("GET", `${page.path}${append && state.next ? `?cursor=${state.next}` : ""}`, null, { write: true });
    if (mine !== generation) return;
    if (page.shape === "groups") state.groups = data.groups.map((group) => ({ title: tr(`group.${group.id}`), people: group.people }));
    else {
      state.entries = append ? [...state.entries, ...data[page.shape]] : data[page.shape];
      state.next = data.next;
      if (page.readPath && state.entries.some((entry) => !entry.read)) {
        request("PUT", page.readPath, null, { write: true }).then(() => { state.counts[page.id] = 0; renderSidebar(); }, () => {});
      }
    }
    return;
  }
  if (view.kind === "home") return list({});
  if (feedOf(view.kind)) return list({ feed: view.kind });
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
  if (count) button.append(element("span", "post-count", i18n.number(count)));
  button.addEventListener("click", (event) => { event.stopPropagation(); onClick(button); });
  return button;
}

function makePost(post, { root = false } = {}) {
  known.set(post.user.login, post.user.name);
  const card = element("div", root ? "post root" : "post");
  card.dataset.id = post.id;
  const content = element("div", "post-content");
  if (post.repostedBy) {
    const reposted = element("span", "post-reposted");
    reposted.append(icon("repeat"), element("span", "", tr("post.reposted", { name: post.repostedBy.name })));
    content.append(reposted);
  }
  const head = element("div", "post-head");
  const name = link("post-name", profileAddress(post.user.login), post.user.name, () => go({ user: post.user.login }));
  const time = element("span", "post-time", ago(post.createdAt));
  time.title = fullDate(post.createdAt);
  if (post.editedAt) time.textContent = `${time.textContent} · ${tr("post.edited")}`;
  head.append(name, element("span", "post-login", `@${post.user.login}`), time);
  if (post.parentId && post.parentLogin) {
    card.classList.add("reply");
    const replying = element("span", "post-replying", tr("post.replyingTo"));
    replying.append(" ", link("post-mention", profileAddress(post.parentLogin), `@${post.parentLogin}`, () => go({ user: post.parentLogin })));
    content.append(head, replying);
  } else content.append(head);
  const body = element("div", "post-body selectable");
  body.append(richText(post.body));
  let expand = null;
  const { preview } = i18n.data;
  if (!root && (post.body.length > preview.chars || post.body.split("\n").length > preview.lines)) {
    body.classList.add("clamped");
    body.style.setProperty("--clamp-lines", preview.lines);
    expand = textButton(tr("post.showMore"), (event) => {
      event.stopPropagation();
      body.classList.remove("clamped");
      expand.remove();
    }, "ghost post-expand");
  }
  const actions = element("div", "post-actions");
  actions.append(
    actionButton(post.liked ? "post-like on" : "post-like", "heart", tr(post.liked ? "post.unlike" : "post.like"), post.likes, `like-${post.id}`, () => toggleLike(post)),
    actionButton("post-reply", "message", tr("post.reply"), post.replies, `reply-${post.id}`, () => { go({ post: post.id }); els.composerText.focus(); }),
    actionButton(post.reposted ? "post-repost on" : "post-repost", "repeat", tr(post.reposted ? "post.unrepost" : "post.repost"), post.reposts, `repost-${post.id}`, () => toggleRepost(post)),
    actionButton("post-share", "share", tr("post.share"), 0, `share-${post.id}`, () => sharePost(post)),
    actionButton(post.saved ? "post-save on" : "post-save", "bookmark", tr(post.saved ? "post.unsave" : "post.save"), 0, `save-${post.id}`, () => toggleSave(post)),
  );
  actions.append(actionButton("post-more", "more", tr("post.more"), 0, `more-${post.id}`, (button) => openPostMenu(post, button)));
  let gallery = null;
  if (post.images?.length) {
    gallery = element("div", post.images.length === 1 ? "post-images single" : "post-images");
    for (const key of post.images) {
      const frame = element("div", "post-image");
      frame.tabIndex = 0;
      frame.setAttribute("role", "button");
      frame.setAttribute("aria-label", tr("image.view"));
      const picture = element("img");
      picture.src = `${api}/media/${key}`;
      picture.alt = "";
      picture.loading = "lazy";
      frame.append(picture);
      frame.addEventListener("click", (event) => { event.stopPropagation(); openImage(key); });
      frame.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.stopPropagation(); openImage(key); } });
      gallery.append(frame);
    }
  }
  content.append(body, ...(expand ? [expand] : []), ...(gallery ? [gallery] : []), actions);
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
  state.posts = state.posts.map((post) => (post.id === updated.id ? { ...updated, repostedBy: post.repostedBy } : post));
  if (state.root?.id === updated.id) state.root = updated;
}

async function toggleLike(post) {
  if (!account.get()) return account.open();
  try {
    replacePost(await request(post.liked ? "DELETE" : "PUT", `/posts/${post.id}/like`, null, { write: true }));
  } catch (error) { report(error); }
  render();
}

const listsMyReposts = () => state.view.kind === "home" || state.view.kind === "following" || (state.view.kind === "profile" && same(state.view.login));

async function toggleRepost(post) {
  if (!account.get()) return account.open();
  try {
    const updated = await request(post.reposted ? "DELETE" : "PUT", `/posts/${post.id}/repost`, null, { write: true });
    replacePost(updated);
    if (post.reposted) state.posts = state.posts.filter((item) => !(item.id === post.id && item.repostedBy && same(item.repostedBy.login)));
    else if (listsMyReposts()) state.posts = [{ ...updated, repostedBy: { login: account.get().login, name: account.get().name } }, ...state.posts];
    popups.toast(tr(post.reposted ? "post.repostUndone" : "post.repostDone"), { kind: "success" });
  } catch (error) { report(error); }
  render();
}

async function toggleSave(post) {
  if (!account.get()) return account.open();
  try {
    const updated = await request(post.saved ? "DELETE" : "PUT", `/posts/${post.id}/save`, null, { write: true });
    replacePost(updated);
    if (post.saved && state.view.kind === "saved") state.posts = state.posts.filter((item) => item.id !== post.id);
    popups.toast(tr(post.saved ? "post.saveUndone" : "post.saveDone"), { kind: "success" });
  } catch (error) { report(error); }
  render();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  const area = element("textarea");
  area.value = text;
  area.readOnly = true;
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  return copied;
}

async function sharePost(post) {
  const url = `${location.origin}${location.pathname}?post=${post.id}`;
  let shared = await copyText(url);
  if (!shared) shared = await navigator.share?.({ url }).then(() => true, () => false);
  popups.toast(tr(shared ? "post.shared" : "post.shareFailed"), { kind: shared ? "success" : "error" });
}

function dropAuthor(login) {
  state.posts = state.posts.filter((item) => item.user.login !== login && item.repostedBy?.login !== login);
}

async function setRelation(kind, login, on) {
  try {
    const profile = await request(on ? "PUT" : "DELETE", `/users/${encodeURIComponent(login)}/${kind}`, null, { write: true });
    popups.toast(tr(`${kind}.${on ? "on" : "off"}`, { login }), { kind: "success" });
    if (state.profile?.login === login) state.profile = profile;
    if (on && state.view.kind === "profile") return load();
    if (on) dropAuthor(login);
  } catch (error) { report(error); }
  render();
}

async function blockUser(login) {
  if (await popups.ask({ text: tr("block.confirm", { login }), ok: tr("block.ok") })) setRelation("block", login, true);
}

async function reportPost(post) {
  const reason = await popups.ask({ text: tr("report.prompt"), value: "" });
  if (reason === null) return;
  try {
    await request("POST", `/posts/${post.id}/report`, { reason }, { write: true });
    popups.toast(tr("report.sent"), { kind: "success" });
  } catch (error) { report(error); }
}

function openPostMenu(post, button) {
  if (!account.get()) return account.open();
  const login = post.user.login;
  if (same(login)) {
    const editable = Date.now() - post.createdAt <= state.config.editMinutes * MINUTE;
    components.menu({
      anchor: button,
      items: [
        ...(editable ? [{ label: tr("post.edit"), icon: "pencil", onSelect: () => openComposeDialog(post) }] : []),
        { label: tr("post.delete"), icon: "trash", danger: true, onSelect: () => removePost(post) },
      ],
    });
    return;
  }
  const items = [
    { label: tr("post.report"), icon: "alert", onSelect: () => reportPost(post) },
    { label: tr("post.mute", { login }), icon: "volume", onSelect: () => setRelation("mute", login, true) },
    { label: tr("post.block", { login }), icon: "lock", danger: true, onSelect: () => blockUser(login) },
  ];
  if (isModerator()) items.push({ separator: true }, { label: tr("post.moderatorDelete"), icon: "trash", danger: true, onSelect: () => removePost(post) });
  components.menu({ anchor: button, items });
}

async function dismissReport(entry) {
  try {
    await request("DELETE", `/reports/${entry.id}`, null, { write: true });
    state.entries = state.entries.filter((item) => item.id !== entry.id);
    popups.toast(tr("report.dismissed"), { kind: "success" });
  } catch (error) { report(error); }
  render();
}

function makeNotification(entry) {
  const box = element("div", entry.read ? "notification" : "notification unread");
  const head = element("div", "notification-head");
  const text = element("span", "notification-text");
  text.append(link("post-name", profileAddress(entry.actor.login), entry.actor.name, () => go({ user: entry.actor.login })), " ", tr(`notification.${entry.kind}`));
  head.append(icon(i18n.data.notificationIcons[entry.kind]), text, element("span", "post-time", ago(entry.createdAt)));
  box.append(head);
  if (entry.post) box.append(makePost(entry.post));
  return box;
}

function makeReport(entry) {
  const box = element("div", "report");
  const head = element("div", "report-head");
  head.append(element("span", "report-by", tr("report.by", { login: entry.reporter.login })), element("span", "post-time", ago(entry.createdAt)));
  const reason = element("div", "report-reason selectable", entry.reason ? tr("report.reason", { reason: entry.reason }) : tr("report.noReason"));
  const actions = element("div", "report-actions");
  actions.append(textButton(tr("report.delete"), () => removePost(entry.post), "danger"), textButton(tr("report.dismiss"), () => dismissReport(entry)));
  box.append(head, reason, makePost(entry.post), actions);
  return box;
}

const renderers = { reports: makeReport, notifications: makeNotification };

async function refreshCounts() {
  if (!account.get() || !savedSession()) {
    state.counts = {};
    return renderSidebar();
  }
  for (const page of i18n.data.pages.filter((item) => item.count && pageOf(item.id))) {
    try {
      state.counts[page.id] = (await request("GET", page.count)).unread;
    } catch {}
  }
  renderSidebar();
}

async function removePost(post) {
  const confirmed = await popups.ask({ text: tr("post.deleteConfirm"), ok: tr("post.deleteOk") });
  if (!confirmed) return;
  try {
    await request("DELETE", `/posts/${post.id}`, null, { write: true });
  } catch (error) { return report(error); }
  popups.toast(tr("post.deleted"), { kind: "success" });
  if (state.root?.id === post.id) return goBack();
  state.posts = state.posts.filter((item) => item.id !== post.id);
  state.entries = state.entries.filter((item) => item.post.id !== post.id);
  if (state.root) state.root = { ...state.root, replies: Math.max(0, state.root.replies - 1) };
  render();
}

function fitComposer(fields) {
  const { text } = fields;
  text.style.height = "auto";
  text.style.height = `${text.scrollHeight + text.offsetHeight - text.clientHeight}px`;
}
function openImage(key) {
  els.imageView.src = `${api}/media/${key}`;
  els.imageDialog.showModal();
}

async function prepareImage(file) {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, state.config.imageSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return (await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", IMAGE_QUALITY))) ?? file;
}

function renderImages(fields) {
  fields.imageList.replaceChildren(...fields.images.map((image) => {
    const box = element("div", "composer-image");
    const picture = element("img");
    picture.src = image.preview;
    picture.alt = "";
    const remove = element("button", "square");
    remove.type = "button";
    remove.title = tr("compose.removeImage");
    remove.setAttribute("aria-label", tr("compose.removeImage"));
    remove.append(icon("close"));
    remove.addEventListener("click", () => {
      URL.revokeObjectURL(image.preview);
      fields.images = fields.images.filter((item) => item !== image);
      renderImages(fields);
      updateComposer(fields);
    });
    box.append(picture, remove);
    return box;
  }));
}

function clearImages(fields) {
  for (const image of fields.images) URL.revokeObjectURL(image.preview);
  fields.images = [];
  renderImages(fields);
}

async function addImages(fields, files) {
  if (!account.get()) return account.open();
  if (!(state.config?.imagesMax > 0)) return;
  const { imagesMax, imageMaxBytes } = state.config;
  const room = Math.max(0, imagesMax - fields.images.length - fields.uploading);
  const picked = [...files];
  if (picked.length > room) popups.toast(tr("image.limit", { max: i18n.number(imagesMax) }), { kind: "warning" });
  for (const file of picked.slice(0, room)) {
    if (!i18n.data.imageTypes.includes(file.type)) {
      popups.toast(tr("image.type"), { kind: "warning" });
      continue;
    }
    fields.uploading++;
    updateComposer(fields);
    try {
      const blob = await prepareImage(file);
      if (blob.size > imageMaxBytes) {
        popups.toast(tr("image.tooBig", { size: components.formatSize(imageMaxBytes) }), { kind: "warning" });
        continue;
      }
      const { key } = await request("POST", "/media", blob, { write: true });
      fields.images.push({ key, preview: URL.createObjectURL(blob) });
    } catch (error) { report(error); } finally {
      fields.uploading--;
      renderImages(fields);
      updateComposer(fields);
    }
  }
}

function updateComposer(fields) {
  fitComposer(fields);
  const length = [...fields.text.value.trim()].length;
  const max = state.config?.postMax ?? 0;
  fields.counter.textContent = max ? tr("compose.counter", { count: i18n.number(length), max: i18n.number(max) }) : "";
  fields.counter.classList.toggle("over", max > 0 && length > max);
  const room = (state.config?.imagesMax ?? 0) - fields.images.length - fields.uploading;
  fields.imageButton.classList.toggle("hidden", !(state.config?.imagesMax > 0) || !!fields.editing);
  fields.imageButton.disabled = room <= 0;
  fields.button.disabled = (!length && !fields.images.length) || (max > 0 && length > max) || state.sending || fields.uploading > 0;
}

async function publish(fields, { reply }) {
  if (fields.button.disabled) return;
  state.sending = true;
  updateComposer(fields);
  try {
    if (fields.editing) {
      replacePost(await request("PATCH", `/posts/${fields.editing.id}`, { body: fields.text.value }, { write: true }));
      fields.text.value = "";
      fields.editing = null;
      fields.done?.();
      popups.toast(tr("post.editSaved"), { kind: "success" });
      state.sending = false;
      return render();
    }
    const post = await request("POST", "/posts", { body: fields.text.value, parentId: reply ? Number(state.view.id) : null, images: fields.images.map((image) => image.key) }, { write: true });
    fields.text.value = "";
    clearImages(fields);
    if (reply) {
      state.posts = [...state.posts, post];
      state.root = { ...state.root, replies: state.root.replies + 1 };
    } else if (state.view.kind === "home") state.posts = [post, ...state.posts];
    else if (state.view.kind === "profile" && same(state.view.login)) load();
    fields.done?.();
    popups.toast(tr(reply ? "post.replied" : "post.posted"), { kind: "success" });
  } catch (error) { report(error); }
  state.sending = false;
  render();
}

function openComposeDialog(post = null) {
  if (!account.get()) return account.open();
  menu.set(false);
  composers.dialog.editing = post;
  els.composeTitle.textContent = tr(post ? "compose.edit" : "compose.new");
  els.dialogButtonText.textContent = tr(post ? "compose.save" : "compose.post");
  els.dialogText.value = post ? post.body : "";
  setAvatar(els.dialogAvatar, account.get());
  els.dialogText.placeholder = tr("compose.placeholder");
  els.composeDialog.showModal();
  updateComposer(composers.dialog);
  els.dialogText.focus();
}

async function toggleFollow() {
  if (!account.get()) return account.open();
  const profile = state.profile;
  try {
    state.profile = await request(profile.followed ? "DELETE" : "PUT", `/users/${encodeURIComponent(profile.login)}/follow`, null, { write: true });
  } catch (error) { report(error); }
  render();
}

async function editBio() {
  const value = await popups.ask({ text: tr("profile.bioPrompt"), value: state.profile.bio });
  if (value === null) return;
  try {
    state.profile = await request("PATCH", "/me", { bio: value }, { write: true });
    popups.toast(tr("profile.bioSaved"), { kind: "success" });
  } catch (error) { report(error); }
  render();
}

async function deleteData() {
  const confirmed = await popups.ask({ text: tr("profile.deleteDataConfirm"), ok: tr("profile.deleteDataOk") });
  if (!confirmed) return;
  try {
    await request("DELETE", "/me", null, { write: true });
  } catch (error) { return report(error); }
  writeSession(null);
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
  if (same(profile.login)) actions.append(textButton(tr("profile.edit"), editBio), textButton(tr("profile.deleteData"), deleteData, "danger"));
  else {
    actions.append(textButton(tr(profile.followed ? "profile.unfollow" : "profile.follow"), toggleFollow, profile.followed ? "" : "primary"));
    if (account.get()) {
      actions.append(
        textButton(tr(profile.muted ? "profile.unmute" : "profile.mute"), () => setRelation("mute", profile.login, !profile.muted)),
        textButton(tr(profile.blocked ? "profile.unblock" : "profile.block"), () => (profile.blocked ? setRelation("block", profile.login, false) : blockUser(profile.login)), "danger"),
      );
    }
  }
  details.append(element("span", "profile-name", profile.name), element("span", "profile-login", `@${profile.login}`), bio, counts, actions);
  card.replaceChildren(avatar, details);
}

function renderPeople() {
  const { kind } = state.view;
  const groups = kind === "search" ? [{ title: tr("people.title"), people: state.people }] : pageOf(kind)?.shape === "groups" ? state.groups : [];
  const filled = groups.filter((group) => group.people.length);
  els.people.classList.toggle("hidden", !filled.length);
  els.people.replaceChildren(...filled.map((group) => {
    const list = element("div", "people-list");
    for (const person of group.people) {
      known.set(person.login, person.name);
      const chip = link("person", profileAddress(person.login), "", () => go({ user: person.login }));
      const avatar = element("span", "avatar");
      setAvatar(avatar, person);
      chip.append(avatar, element("span", "person-name", `${person.name} @${person.login}`));
      list.append(chip);
    }
    const section = element("div", "people-group");
    section.append(element("span", "people-title", group.title), list);
    return section;
  }));
  return filled.length > 0;
}

function renderSidebar() {
  const signedIn = !!account.get();
  const kind = state.view.kind;
  const own = state.view.kind === "profile" && same(state.view.login);
  const item = (id, iconName, label, on, onClick, badge = 0) => {
    const button = element("button", `sidebar-item${on ? " on" : ""}`);
    button.type = "button";
    button.dataset.focusKey = `nav-${id}`;
    button.append(icon(iconName), element("span", "sidebar-item-title", label));
    if (badge) button.append(element("span", "badge info", i18n.number(badge)));
    button.addEventListener("click", () => { menu.set(false); onClick(); });
    return button;
  };
  els.sidebarNav.replaceChildren(
    item("home", "home", tr("nav.home"), kind === "home", () => go({})),
    ...i18n.data.feeds.map((feed) => item(feed.id, feed.icon, tr(`nav.${feed.id}`), kind === feed.id, () => go({ tab: feed.id }))),
    ...i18n.data.pages.filter((page) => pageOf(page.id)).map((page) => item(page.id, page.icon, tr(`nav.${page.id}`), kind === page.id, () => go({ tab: page.id }), state.counts[page.id])),
    item("profile", "user", tr("nav.profile"), !!own, () => (signedIn ? go({ user: account.get().login }) : account.open())),
  );
}

function emptyMessage() {
  const { kind } = state.view;
  if (state.loading) return [tr("loading"), ""];
  if (state.failed) return [tr("error.generic"), ""];
  if ((feedOf(kind) || pageOf(kind)) && !account.get()) return [tr(`empty.${kind}SignedOut`), tr("compose.signIn")];
  if (state.missing) return kind === "profile" ? [tr("profile.notFound"), ""] : [tr("post.notFound"), ""];
  if (feedOf(kind) || pageOf(kind)) return [tr(`empty.${kind}Title`), tr(`empty.${kind}Text`)];
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
  els.feedTabs.classList.toggle("hidden", kind !== "home" && kind !== "following");
  els.feedTabs.value = kind;
  els.backButton.classList.toggle("hidden", kind === "home" || !!feedOf(kind) || !!pageOf(kind));
  els.refreshButton.disabled = state.loading;

  renderProfile();
  const peopleShown = renderPeople();
  renderSidebar();

  els.composer.classList.toggle("hidden", !writable);
  els.signinRow.classList.toggle("hidden", signedIn || kind === "following" || kind === "search");
  if (writable) {
    els.composerText.placeholder = tr(thread ? "compose.replyPlaceholder" : "compose.placeholder");
    els.composerButtonText.textContent = tr(thread ? "compose.reply" : "compose.post");
    setAvatar(els.composerAvatar, account.get());
    updateComposer(composers.inline);
  }

  const rootShown = thread && !!state.root;
  els.rootPost.replaceChildren(...(rootShown ? [makePost(state.root, { root: true })] : []));
  const makeEntry = renderers[pageOf(kind)?.shape];
  const cards = makeEntry ? state.entries.map(makeEntry) : state.posts.map((post) => makePost(post));
  els.postList.replaceChildren(...cards);
  els.feed.classList.toggle("hidden", !writable && els.signinRow.classList.contains("hidden") && !cards.length && !rootShown);

  const showEmpty = state.loading ? !cards.length && !rootShown : !cards.length && !peopleShown;
  els.emptyState.classList.toggle("hidden", !showEmpty);
  if (showEmpty) {
    const [heading, text] = emptyMessage();
    els.emptyState.heading = heading;
    els.emptyState.text = text;
  }
  els.moreButton.classList.toggle("hidden", !state.next || state.loading);

  els.status.textContent = signedIn ? tr("status.signedIn", { login: account.get().login }) : tr("status.signedOut");
  if (keep) els.timeline.querySelector(`[data-focus-key="${keep}"]`)?.focus();
}

const menu = components.drawer({ sidebar: els.sidebar, button: els.menuButton });

els.backButton.addEventListener("click", goBack);
els.refreshButton.addEventListener("click", () => load());
els.moreButton.addEventListener("click", () => { els.moreButton.disabled = true; load({ append: true }).finally(() => { els.moreButton.disabled = false; }); });
Object.assign(composers, {
  inline: { text: els.composerText, counter: els.composerCounter, button: els.composerButton, imageButton: els.composerImageButton, imageInput: els.composerImageInput, imageList: els.composerImages, images: [], uploading: 0, replies: true },
  dialog: { text: els.dialogText, counter: els.dialogCounter, button: els.dialogButton, imageButton: els.dialogImageButton, imageInput: els.dialogImageInput, imageList: els.dialogImages, images: [], uploading: 0, replies: false, done: () => els.composeDialog.close() },
});
for (const fields of Object.values(composers)) {
  const reply = () => fields.replies && state.view.kind === "thread";
  fields.text.addEventListener("input", () => updateComposer(fields));
  fields.text.addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); publish(fields, { reply: reply() }); } });
  fields.button.addEventListener("click", () => publish(fields, { reply: reply() }));
}
els.newPostButton.addEventListener("click", () => openComposeDialog());
els.composeDialog.addEventListener("close", () => {
  if (composers.dialog.editing) els.dialogText.value = "";
  composers.dialog.editing = null;
});
els.composeCloseButton.addEventListener("click", () => els.composeDialog.close());
for (const fields of Object.values(composers)) {
  fields.imageButton.addEventListener("click", () => fields.imageInput.click());
  fields.imageInput.addEventListener("change", () => {
    addImages(fields, fields.imageInput.files);
    fields.imageInput.value = "";
  });
  fields.text.addEventListener("paste", (event) => {
    const files = [...(event.clipboardData?.files ?? [])].filter((file) => i18n.data.imageTypes.includes(file.type));
    if (files.length) {
      event.preventDefault();
      addImages(fields, files);
    }
  });
}
els.feedTabs.addEventListener("change", (event) => go(event.detail.value === "home" ? {} : { tab: event.detail.value }));
els.imageCloseButton.addEventListener("click", () => els.imageDialog.close());
els.imageDialog.addEventListener("click", (event) => { if (event.target === els.imageDialog) els.imageDialog.close(); });
els.imageDialog.addEventListener("close", () => { els.imageView.removeAttribute("src"); });
els.composeDialog.addEventListener("click", (event) => { if (event.target === els.composeDialog) els.composeDialog.close(); });
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
  if (!signedIn) writeSession(null);
  load().then(refreshCounts);
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshCounts(); });
i18n.onChange(() => render());

els.postSearch.value = urlState.get("q");
load().then(refreshCounts);
