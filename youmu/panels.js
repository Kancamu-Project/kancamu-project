// The panels of the settings that need more than a value: they work on the data of a web (its chats, its downloaded models, its drive).
// A web names the panels it wants in its data.json ("settings": { "panels": [...] }); the account web draws them and does the work, so the web itself has no code for it.
// Every panel gets { app, data, t, ask, toast, announce }: the name of the web, its data.json, a function for its texts, the shared question dialog, a toast,
// and a function that tells the web what was done to its data (assets/settings.js: the web follows it with settings.listen).

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
// A panel: a title, a hint, and what it holds.
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
const lsSet = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const lsDelete = (key) => { try { localStorage.removeItem(key); } catch {} };
function download(name, text, type) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/* ---------- muAI ---------- */
// Whether the browser can run the models.
async function webgpu({ t }) {
    let ok = false;
    try { ok = !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch {}
    const status = element("span", `status ${ok ? "ok" : "bad"}`, t(ok ? "gpu.active" : "gpu.unavailable"));
    return panel(t("set.gpu.label"), "", status);
}

// The models whose files are in the cache of the browser (Transformers.js keeps them there, under the address of the model), and can be deleted.
// A web says which ones are its own in its data.json: "settings": { "models": { "cache": "...", "repos": [ { "list": "models", "key": "id" }, { "pattern": "^Xenova/opus-mt-" } ] } }:
// the models of a list of its data (with their names), or the repositories whose name matches a pattern.
async function downloadedModels({ app, data, t, ask, toast, announce }) {
    const config = data.settings.models;
    const sizeLabel = (megabytes) => (megabytes >= 1000 ? `${(megabytes / 1000).toFixed(1)} GB` : `${megabytes} MB`);
    const listed = new Map();   // the repositories that come from a list of the data: id -> { name, mb }
    const patterns = [];
    for (const entry of config.repos) {
        if (entry.pattern) patterns.push(new RegExp(entry.pattern));
        else for (const item of data[entry.list] || []) if (item[entry.key]) listed.set(item[entry.key], { name: item.name, mb: item.mb });
    }
    const list = element("div", "downloaded-models");
    const found = async () => {
        if (!("caches" in window)) return [];
        const cache = await caches.open(config.cache);
        const groups = new Map();
        for (const request of await cache.keys()) {
            const id = request.url.match(/huggingface\.co\/(.+?)\/resolve\//)?.[1];
            if (!id || !(listed.has(id) || patterns.some((pattern) => pattern.test(id)))) continue;
            groups.set(id, [...(groups.get(id) || []), request]);
        }
        const result = [];
        for (const [id, requests] of groups) {
            let bytes = 0;
            for (const request of requests) bytes += Number((await cache.match(request))?.headers.get("content-length")) || 0;
            result.push({ id, name: listed.get(id)?.name || id.split("/").pop(), requests, bytes: bytes || (listed.get(id)?.mb || 0) * 1e6 });
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    };
    const render = async () => {
        const models = await found();
        list.replaceChildren(...(models.length ? models.map((entry) => {
            const row = element("div", "downloaded-model");
            const remove = button("trash", t("models.delete"), "danger");
            remove.addEventListener("click", async () => {
                const label = sizeLabel(Math.round(entry.bytes / 1e6));
                if (!(await ask({ text: t("confirm.deleteModel", { name: entry.name, size: label }), ok: t("models.delete") }))) return;
                const cache = await caches.open(config.cache);
                for (const request of entry.requests) await cache.delete(request);
                if (app === "muai") {   // muAI keeps what it knows about its models
                    lsDelete(`muai.seen.${entry.id}`);
                    if (settings.get("muai").model === entry.id) { settings.set("muai", { ...settings.get("muai"), model: "" }); lsSet("muai.autoload", "0"); }   // it was the chosen one: it is not downloaded again on its own
                }
                announce({ type: "modelDeleted", id: entry.id });
                toast(t("toast.modelDeleted", { name: entry.name }));
                render();
            });
            row.append(element("span", "downloaded-model-name", entry.name), element("span", "downloaded-model-size", sizeLabel(Math.round(entry.bytes / 1e6))), remove);
            return row;
        }) : [element("span", "field-hint", t("set.models.empty"))]));
    };
    await render();
    return panel(t("set.models.label"), t("set.models.hint"), list);
}

// The chats are kept in the browser (IndexedDB) and, signed in, on the muai branch of the user's storage.
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
        if (!chats?.length) return toast(t("toast.noHistory"));
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
        } catch { toast(t("toast.invalidImport")); }
    });
    deleteAll.addEventListener("click", async () => {
        const database = await openChats();
        const count = database ? await chatRequest(database, "readonly", (store) => store.count()) : 0;
        if (!count) return toast(t("toast.noHistory"));
        if (!(await ask({ text: t("confirm.deleteAll", { n: count }), ok: t("data.deleteAll") }))) return;
        await chatRequest(database, "readwrite", (store) => store.clear());
        if (account.get()) {   // the copies in the storage too, or they would come back
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

/* ---------- every web ---------- */
// Puts the settings of the web back to their first values; the web follows what is announced.
function restoreDefaults({ app, t, ask, announce }) {
  const reset = button("refresh", t("reset"), "danger");
  reset.addEventListener("click", async () => {
    if (!(await ask({ text: t("reset.text"), ok: t("reset") }))) return;
    settings.reset(app);
    announce({ type: "reset" });
  });
  return panel(t("reset.title"), t("reset.hint"), reset);
}

/* ---------- Drivemu ---------- */
// The drive is the drivemu branch of the storage: how much of it is used, and the reset.
// The branch is opened once for the panels (opening it asks GitHub, and two panels need it).
let drive = { token: "", store: null };
function driveStore() {
    const signedIn = account.get();
    if (!signedIn) return Promise.resolve(null);
    if (drive.token !== signedIn.token) drive = { token: signedIn.token, store: storage.connect("drivemu").catch(() => null) };
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
// The reset: every file and folder is deleted, and the default folders are made again, in one commit (git data API).
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
        toast(t("reset.doing"));
        try {
            const ref = await call(`/git/ref/heads/${store.branch}`);
            const commit = await call(`/git/commits/${ref.object.sha}`);
            const tree = await call(`/git/trees/${commit.tree.sha}?recursive=1`);
            const empty = await call("/git/blobs", { method: "POST", body: JSON.stringify({ content: "", encoding: "utf-8" }) });
            const entries = tree.tree.filter((item) => item.type === "blob" && item.path !== keep).map((item) => ({ path: item.path, mode: item.mode, type: "blob", sha: null }));
            entries.push(...data.drive.defaultFolders.map((name) => ({ path: `${name}/${keep}`, mode: "100644", type: "blob", sha: empty.sha })));
            const newTree = await call("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }) });
            const newCommit = await call("/git/commits", { method: "POST", body: JSON.stringify({ message: "Drivemu: reset", tree: newTree.sha, parents: [ref.object.sha] }) });
            await call(`/git/refs/heads/${store.branch}`, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) });
            announce({ type: "reset", head: newCommit.sha });
            toast(t("reset.done"));
        } catch (error) { toast(t("failed", { message: error.message })); }
        reset.disabled = false;
    });
    return panel(t("reset.title"), t("reset.hint"), reset);
}

/* ---------- Lingomu and muJS ---------- */
// The progress of a web (Lingomu, muJS) is kept in this browser ("<app>.progress") and, once signed in, on the branch of the web (progress.json): the reset deletes both.
function progressReset({ app, t, ask, toast, announce }) {
    const reset = button("refresh", t("progress.reset"), "danger");
    reset.addEventListener("click", async () => {
        if (!(await ask({ title: t("progress.title"), text: t("progress.text"), ok: t("progress.reset") }))) return;
        reset.disabled = true;
        lsDelete(`${app}.progress`);
        if (account.get()) {   // the copy in the storage too, or it would come back
            try { await storage.removeFile(await storage.connect(app), "progress.json", `${app}: reset the progress`); } catch (error) { console.warn("[sync]", error); }
        }
        announce({ type: "progressReset" });
        toast(t("progress.done"));
        reset.disabled = false;
    });
    return panel(t("progress.title"), t("progress.hint"), reset);
}

export const panels = { webgpu, downloadedModels, chatData, restoreDefaults, driveUsage, driveReset, progressReset };
