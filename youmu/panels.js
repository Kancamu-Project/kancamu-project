// The panels of the settings that need more than a value: they work on the data of an app (its chats, its downloaded models, its drive).
// An app names the panels it wants in its data.js ("settings": { "panels": [...] }); the account app draws them and does the work, so the app itself has no code for it.
// Every panel gets { app, data, t, ask, toast, announce }: the name of the app, its data.js, a function for its texts, the shared question dialog, a toast,
// and a function that tells the app what was done to its data (assets/js/settings.js: the app follows it with settings.listen).

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

// The models of an app that works with one of them at a time (muAI, Picmu, Transmu): one list with every model of its data, and for each one the choice (the radio), whether its
// files are in the cache of the browser (Transformers.js keeps them there, under the address of the model), and the deletion of them. It is the list of the models and the list of
// the downloaded models in one. An app describes it in its data.js: "settings": { "models": { "cache": "transformers-cache", "choose": "model", "list": "models", "repo": "id",
// "repoTemplate": "modelTemplate" } }: choose is the setting that holds the choice, list the list of the models of the app (each one has an id and a name), repo the field with the
// repository of a model on Hugging Face, and repoTemplate (when a model is one repository for each pair of languages, as Opus-MT is) the field with an address such as
// "Xenova/opus-mt-{from}-{to}": every repository that fits it is of the model. An app with several tools (Picmu) chooses a model for each one: a model has its own "choose"
// (the setting that holds its choice) and a "group" (the text of the heading above the models of the tool). Choosing a model that is not downloaded downloads it (the app does it when it is used).
async function modelList({ app, data, t, ask, toast, announce }) {
    const config = data.settings.models;
    const defaults = data.settings.defaults || {};
    const keyOf = (item) => item.choose || config.choose;   // the setting that holds the choice of the tool of a model
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
    // the files in the cache, by repository: repository -> { requests, bytes }
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
                    if (app === "muai") {   // muAI keeps what it knows about its models
                        lsDelete(`muai.seen.${item.id}`);
                        if (settings.get("muai")[config.choose] === item.id) { settings.set("muai", { ...settings.get("muai"), [config.choose]: "" }); lsSet("muai.autoload", "0"); }   // it was the chosen one: it is not downloaded again on its own
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

/* ---------- every app ---------- */
// Puts the settings of the app back to their first values; the app follows what is announced.
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
// The drive is the whole repository of the storage, as Drivemu shows it: how much of the storage is used, and the reset of the drive.
// It is opened once for the panels (opening it asks GitHub, and two panels need it).
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
// The reset: every file and folder of the drive, and the data of Drivemu itself (AppData/drivemu), are deleted, and the default folders are made again, in one commit (git data API).
// The rest of AppData (the folders of the other apps: the chats of muAI, the progress of the lessons) and README.md are not deleted: the reset of one app never takes the data of another.
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
            const ofDrive = (path) => path.startsWith(`${store.own}/`) || !store.system.some((name) => path === name || path.startsWith(`${name}/`));   // the drive and its own data; not the rest of AppData, not README.md
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

/* ---------- Lingomu and muJS ---------- */
// The progress of an app (Lingomu, muJS) is kept in this browser ("<app>.progress") and, once signed in, in the folder of the app (progress.json): the reset deletes both.
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

export const panels = { webgpu, modelList, chatData, restoreDefaults, driveUsage, driveReset, progressReset };
