import { i18n, account, settings, storage } from "../assets/js/shared.js";

const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
};
const button = (iconName, text, className = "") => {
    const node = element("button", className);
    node.type = "button";
    node.innerHTML = `<span class="icon icon-${iconName}"></span><span></span>`;
    node.lastChild.textContent = text;
    return node;
};
function panel(title, hint, ...content) {
    const box = element("div", "detail-section");
    box.append(element("span", "detail-section-title", title));
    if (hint) box.append(element("span", "field-hint", hint));
    box.append(...content);
    return box;
}
const size = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes, index = -1;
    do { value /= 1024; index++; } while (value >= 1024 && index < units.length - 1);
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[index]}`;
};
const lsGet = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const lsDelete = (key) => { try { localStorage.removeItem(key); } catch {} };
function download(name, text, type) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function webgpu({ t }) {
    let ok = false;
    try { ok = !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch {}
    const status = element("span", `status ${ok ? "ok" : "bad"}`, t(ok ? "gpu.active" : "gpu.unavailable"));
    return panel(t("set.gpu.label"), "", status);
}

async function modelList({ app, data, t, ask, toast, announce }) {
    const config = data.settings.models;
    const defaults = data.settings.defaults || {};
    const keyOf = (item) => item.choose || config.choose;
    const all = (data[config.list] || []).filter((item) => item.id);
    const order = [...new Set(all.map(keyOf))];
    const items = all.sort((a, b) => order.indexOf(keyOf(a)) - order.indexOf(keyOf(b)) || a.name.localeCompare(b.name));
    const sizeLabel = (megabytes) => (megabytes >= 1000 ? `${(megabytes / 1000).toFixed(1)} GB` : `${megabytes} MB`);
    const patternOf = (item) => {
        const template = config.repoTemplate && item[config.repoTemplate];
        if (!template) return null;
        return new RegExp(`^${template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{[a-z]+\\\}/g, "[^/]+")}$`);
    };
    const patterns = new Map(items.map((item) => [item.id, patternOf(item)]));
    const ownedBy = (item, repository) => item[config.repo] === repository || !!patterns.get(item.id)?.test(repository);
    const list = element("div", "downloaded-models");
    const cached = async () => {
        const found = new Map();
        if (!("caches" in window)) return found;
        const cache = await caches.open(config.cache);
        for (const request of await cache.keys()) {
            const repository = request.url.match(/huggingface\.co\/(.+?)\/resolve\//)?.[1];
            if (!repository) continue;
            const group = found.get(repository) || { requests: [], bytes: 0 };
            group.requests.push(request);
            group.bytes += Number((await cache.match(request))?.headers.get("content-length")) || 0;
            found.set(repository, group);
        }
        return found;
    };
    const render = async () => {
        const repositories = await cached();
        const current = settings.get(app, defaults);
        let group = "";
        list.replaceChildren(...items.flatMap((item, index) => {
            const mine = [...repositories].filter(([repository]) => ownedBy(item, repository)).map(([, group]) => group);
            const requests = mine.flatMap((group) => group.requests);
            const have = requests.length > 0;
            const label = have ? sizeLabel(Math.round(mine.reduce((total, group) => total + group.bytes, 0) / 1e6)) : item.mb ? sizeLabel(item.mb) : "";
            const row = element("div", "downloaded-model");
            const radio = element("input", "radio");
            radio.type = "radio";
            radio.name = `${app}-${keyOf(item)}`;
            radio.id = `${app}-model-${index}`;
            radio.checked = (current[keyOf(item)] || "") === item.id;
            radio.addEventListener("change", () => settings.set(app, { ...settings.get(app), [keyOf(item)]: item.id }));
            const text = element("div", "downloaded-model-text");
            const name = element("label", "downloaded-model-name", item.name);
            name.htmlFor = radio.id;
            text.append(name);
            if (item.hint) text.append(element("span", "field-hint", i18n.pick(item.hint)));
            row.append(radio, text);
            if (label) row.append(element("span", "downloaded-model-size", label));
            row.append(element("span", `badge${have ? " success" : ""}`, t(have ? "models.downloaded" : "models.notDownloaded")));
            if (have) {
                const remove = button("trash", t("models.delete"), "danger");
                remove.addEventListener("click", async () => {
                    if (!(await ask({ text: t("confirm.deleteModel", { name: item.name, size: label }), ok: t("models.delete") }))) return;
                    const cache = await caches.open(config.cache);
                    for (const request of requests) await cache.delete(request);
                    if (app === "muai") {
                        lsDelete(`muai.seen.${item.id}`);
                        if (settings.get("muai")[config.choose] === item.id) { settings.set("muai", { ...settings.get("muai"), [config.choose]: "" }); }
                    }
                    announce({ type: "modelDeleted", id: item.id });
                    toast(t("toast.modelDeleted", { name: item.name }));
                    render();
                });
                row.append(remove);
            }
            const heading = item.group && item.group !== group ? [element("span", "downloaded-group", t(item.group))] : [];
            group = item.group || group;
            return [...heading, row];
        }));
    };
    await render();
    return panel(t("set.models.label"), t("set.models.hint"), list);
}

const openChats = () => new Promise((resolve) => {
    try {
        const request = indexedDB.open("muai", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("convs", { keyPath: "id" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    } catch { resolve(null); }
});
const chatRequest = (database, mode, run) => new Promise((resolve) => {
    const request = run(database.transaction("convs", mode).objectStore("convs"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
});

async function chatData({ t, ask, toast, announce }) {
    const file = element("input");
    file.type = "file"; file.accept = "application/json"; file.hidden = true;
    const exportAll = button("download", t("data.exportAll"));
    const importChats = button("upload", t("data.import"));
    const deleteAll = button("trash", t("data.deleteAll"), "danger");
    const row = element("div", "button-row-start");
    row.append(exportAll, importChats, deleteAll, file);

    exportAll.addEventListener("click", async () => {
        const database = await openChats();
        const chats = database ? await chatRequest(database, "readonly", (store) => store.getAll()) : [];
        if (!chats?.length) return toast(t("toast.noHistory"), { kind: "warning" });
        download("muai-history.json", JSON.stringify(chats), "application/json");
    });
    importChats.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
        const chosen = file.files[0];
        file.value = "";
        if (!chosen) return;
        try {
            const imported = JSON.parse(await chosen.text());
            if (!Array.isArray(imported)) throw new Error();
            const database = await openChats();
            const ids = [];
            for (const chat of imported) {
                if (!chat || !Array.isArray(chat.messages) || typeof chat.title !== "string") continue;
                const clean = {
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), title: chat.title.slice(0, 80), created: +chat.created || Date.now(), updated: +chat.updated || Date.now(),
                    messages: chat.messages.filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.text === "string")
                        .map((message) => ({ role: message.role, text: message.text, ...(typeof message.image === "string" && message.image.startsWith("data:image/") ? { image: message.image } : {}), ...(message.error ? { error: true } : {}) })),
                };
                await chatRequest(database, "readwrite", (store) => store.put(clean));
                ids.push(clean.id);
            }
            announce({ type: "imported", ids });
            toast(t("toast.imported", { n: ids.length }));
        } catch { toast(t("toast.invalidImport"), { kind: "error" }); }
    });
    deleteAll.addEventListener("click", async () => {
        const database = await openChats();
        const count = database ? await chatRequest(database, "readonly", (store) => store.count()) : 0;
        if (!count) return toast(t("toast.noHistory"), { kind: "warning" });
        if (!(await ask({ text: t("confirm.deleteAll", { n: count }), ok: t("data.deleteAll") }))) return;
        await chatRequest(database, "readwrite", (store) => store.clear());
        if (account.get()) {
            try {
                const store = await storage.connect("muai");
                for (const item of await storage.list(store, "conversations")) await storage.removeFile(store, `conversations/${item.name}`, "muAI: delete a chat");
            } catch (error) { console.warn("[sync]", error); }
        }
        announce({ type: "chatsDeleted" });
        toast(t("data.deleted"));
    });
    return panel(t("set.data.label"), t("set.data.hint"), row);
}

function restoreDefaults({ app, t, ask, announce }) {
  const reset = button("refresh", t("reset"), "danger");
  reset.addEventListener("click", async () => {
    if (!(await ask({ text: t("reset.text"), ok: t("reset") }))) return;
    settings.reset(app);
    announce({ type: "reset" });
  });
  return panel(t("reset.title"), t("reset.hint"), reset);
}

let drive = { token: "", store: null };
function driveStore() {
    const signedIn = account.get();
    if (!signedIn) return Promise.resolve(null);
    if (drive.token !== signedIn.token) drive = { token: signedIn.token, store: storage.drive().catch(() => null) };
    return drive.store;
}
async function driveUsage({ data, t }) {
    const box = element("div", "detail-rows");
    const store = await driveStore();
    if (store) {
        const used = (store.info.size || 0) * 1024, limit = data.drive.storageLimitGB * 1024 ** 3;
        const percent = Math.min(100, (used / limit) * 100);
        const row = element("div", "detail-row");
        row.append(element("span", "detail-key", t("usage.title")), element("span", "value", t("usage.value", { percent: i18n.number(percent, { maximumFractionDigits: percent < 10 ? 1 : 0 }), used: size(used), limit: size(limit) })));
        box.append(row);
    }
    return store ? panel(t("set.storage"), "", box) : element("span");
}
async function driveReset({ data, t, ask, toast, announce }) {
    const store = await driveStore();
    if (!store) return element("span");
    const keep = data.drive.keepFile;
    const call = async (path, options = {}) => {
        const response = await fetch(`https://api.github.com/repos/${store.owner}/${store.repo}${path}`, {
            cache: "no-store",
            ...options,
            headers: { Authorization: `Bearer ${store.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(options.body ? { "Content-Type": "application/json" } : {}) },
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || response.statusText);
        return response.json();
    };
    const reset = button("refresh", t("reset"), "danger");
    reset.addEventListener("click", async () => {
        if (!(await ask({ title: t("reset.title"), text: t("reset.text"), ok: t("reset") }))) return;
        reset.disabled = true;
        toast(t("reset.doing"), { kind: "info" });
        try {
            const ref = await call(`/git/ref/heads/${store.branch}`);
            const commit = await call(`/git/commits/${ref.object.sha}`);
            const tree = await call(`/git/trees/${commit.tree.sha}?recursive=1`);
            const empty = await call("/git/blobs", { method: "POST", body: JSON.stringify({ content: "", encoding: "utf-8" }) });
            const ofDrive = (path) => path.startsWith(`${store.own}/`) || !store.system.some((name) => path === name || path.startsWith(`${name}/`));
            const entries = tree.tree.filter((item) => item.type === "blob" && ofDrive(item.path) && item.path !== keep).map((item) => ({ path: item.path, mode: item.mode, type: "blob", sha: null }));
            entries.push(...data.drive.defaultFolders.map((name) => ({ path: `${name}/${keep}`, mode: "100644", type: "blob", sha: empty.sha })));
            const newTree = await call("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }) });
            const newCommit = await call("/git/commits", { method: "POST", body: JSON.stringify({ message: "Drivemu: reset", tree: newTree.sha, parents: [ref.object.sha] }) });
            await call(`/git/refs/heads/${store.branch}`, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) });
            announce({ type: "reset", head: newCommit.sha });
            toast(t("reset.done"));
        } catch (error) { toast(t("failed", { message: error.message }), { kind: "error" }); }
        reset.disabled = false;
    });
    return panel(t("reset.title"), t("reset.hint"), reset);
}

function progressReset({ app, t, ask, toast, announce }) {
    const reset = button("refresh", t("progress.reset"), "danger");
    reset.addEventListener("click", async () => {
        if (!(await ask({ title: t("progress.title"), text: t("progress.text"), ok: t("progress.reset") }))) return;
        reset.disabled = true;
        lsDelete(`${app}.progress`);
        if (account.get()) {
            try { await storage.removeFile(await storage.connect(app), "progress.json", `${app}: reset the progress`); } catch (error) { console.warn("[sync]", error); }
        }
        announce({ type: "progressReset" });
        toast(t("progress.done"));
        reset.disabled = false;
    });
    return panel(t("progress.title"), t("progress.hint"), reset);
}

function bookmarkData({ app, t, ask, toast, announce }) {
    const key = `${app}.bookmarks`;
    const read = () => {
        try {
            const list = JSON.parse(lsGet(key));
            return Array.isArray(list) ? list : [];
        } catch { return []; }
    };
    const cleanUrl = (text) => {
        try {
            const url = new URL(String(text).trim());
            return /^https?:$/.test(url.protocol) ? url.href : null;
        } catch { return null; }
    };
    const entriesOf = (text) => {
        let found;
        try {
            const parsed = JSON.parse(text);
            if (!Array.isArray(parsed)) throw new Error();
            found = parsed.map((item) => ({ title: item?.title, url: item?.url, group: item?.group }));
        } catch {
            const page = new DOMParser().parseFromString(text, "text/html");
            found = [...page.querySelectorAll("a[href]")].map((link) => {
                const folder = link.closest("dl")?.previousElementSibling;
                return { title: link.textContent, url: link.getAttribute("href"), group: folder?.tagName === "H3" ? folder.textContent : "" };
            });
        }
        return found;
    };
    const file = element("input");
    file.type = "file";
    file.accept = ".json,.html,.htm,application/json,text/html";
    file.hidden = true;
    const exportAll = button("download", t("data.exportAll"));
    const importAll = button("upload", t("data.import"));
    const deleteAll = button("trash", t("data.deleteAll"), "danger");
    const row = element("div", "button-row-start");
    row.append(exportAll, importAll, deleteAll, file);

    exportAll.addEventListener("click", () => {
        const list = read();
        if (!list.length) return toast(t("toast.noBookmarks"), { kind: "warning" });
        download(`${app}-bookmarks.json`, JSON.stringify(list.map(({ title, url, group }) => ({ title, url, group: group ?? "" })), null, 2), "application/json");
    });
    importAll.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
        const chosen = file.files[0];
        file.value = "";
        if (!chosen) return;
        try {
            const entries = entriesOf(await chosen.text());
            if (!entries.length) throw new Error();
            const current = read();
            const known = new Set(current.map((item) => item.url));
            const added = [];
            for (const item of entries) {
                const url = cleanUrl(item.url);
                if (!url || known.has(url)) continue;
                known.add(url);
                const title = typeof item.title === "string" ? item.title.trim() : "";
                added.push({ id: crypto.randomUUID(), title: title || new URL(url).hostname.replace(/^www\./, ""), url, group: typeof item.group === "string" ? item.group.trim() : "" });
            }
            localStorage.setItem(key, JSON.stringify([...current, ...added]));
            announce({ type: "bookmarksChanged" });
            toast(t("toast.imported", { n: added.length }));
        } catch { toast(t("toast.invalidImport"), { kind: "error" }); }
    });
    deleteAll.addEventListener("click", async () => {
        const count = read().length;
        if (!count) return toast(t("toast.noBookmarks"), { kind: "warning" });
        if (!(await ask({ text: t("confirm.deleteAll", { n: count }), ok: t("data.deleteAll") }))) return;
        lsDelete(key);
        announce({ type: "bookmarksChanged" });
        toast(t("data.deleted"));
    });
    return panel(t("set.data.label"), t("set.data.hint"), row);
}

function historyData({ app, t, ask, toast, announce }) {
    const key = `${app}.history`;
    const count = () => {
        try {
            const list = JSON.parse(lsGet(key));
            return Array.isArray(list) ? list.length : 0;
        } catch { return 0; }
    };
    const clear = button("trash", t("history.delete"), "danger");
    clear.addEventListener("click", async () => {
        const n = count();
        if (!n) return toast(t("history.none"), { kind: "warning" });
        if (!(await ask({ text: t("history.confirm", { n }), ok: t("history.delete") }))) return;
        lsDelete(key);
        announce({ type: "historyChanged" });
        toast(t("history.deleted"));
    });
    return panel(t("set.history.label"), t("set.history.hint"), clear);
}

export const panels = { webgpu, modelList, chatData, bookmarkData, historyData, restoreDefaults, driveUsage, driveReset, progressReset };
