// The GitHub storage shared by the apps that keep data for the user (they all run on one origin).
// One private repository named after the brand (<id>-data, with the id of assets/data/brand.json), on its default branch (main).
// Every app has a folder of its own in the folder AppData: AppData/drivemu, AppData/muai, AppData/lingomu, and so on. An app only touches its own folder,
// and the paths that it gives are inside that folder (the folder is added here), so "a.json" of muai is AppData/muai/a.json in the repository.
// The Drive is not the folder of an app: it is the whole repository, as Drivemu shows it like a file explorer (Documents, Images, Videos, and Audio are next to AppData,
// and AppData is a folder like the others in it). storage.drive() opens it, and its paths are the ones of the repository.
//   const store = await storage.connect("muai");           opens the folder of the app, creating the repository when it is not there yet
//   const drive = await storage.drive();                   opens the whole repository (the Drive)
//   const text = await storage.readFile(store, "a.json");  the text of a file of the folder, or null
//   await storage.writeFile(store, "a.json", text);        saves a file of the folder, and gives its new sha
//   await storage.list(store, "folder");                   [{ name, sha }] of a folder inside the folder of the app
//   await storage.tree(store);                             { files: [{ path, size }], truncated } every file of the folder of the app, in every folder
//   await storage.readBinary(store, "a.jpg");              the bytes of a file (a Uint8Array), or null
//   await storage.writeBinary(store, "a.jpg", bytes);      saves bytes
//   await storage.removeFile(store, "a.json");             deletes a file
// store.root is the whole folder of the app in the repository ("AppData/muai", and "" for the Drive), and store.system (for the Drive) the names at the root of the repository
// that are not files that the user made: AppData and README.md, and store.own (for the Drive) the folder of the data of Drivemu itself, AppData/drivemu.
// An app that works with the git data API itself (Drivemu, the reset of the account app) uses them.
// The repository is made without a README: its first commit is the empty file AppData/.gitkeep.
// Two apps may save at the same moment on the same branch: GitHub then answers 409, and a save or a delete is tried again.
// The account (assets/js/account.js) must be signed in.
(() => {
    const BRAND = new URL("../data/brand.json", document.currentScript.src).href;
    const API = "https://api.github.com";
    const APPS = "AppData";   // the folder that holds the folders of the apps
    const SYSTEM = [APPS, "README.md"];   // at the root of the repository, what is not a file that the user made: the folders of the apps, and the file that GitHub makes
    const TRIES = 4;          // a save that meets another save (409) is tried this many times

    const fail = (code, message = code) => Object.assign(new Error(message), { code });
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const encode = (path) => path.split("/").map(encodeURIComponent).join("/");

    async function call(store, path, options = {}) {
        const response = await fetch(path.startsWith("http") ? path : API + path, {
            cache: "no-store", // the GitHub API replies with max-age=60; without this the browser serves a stale answer
            ...options,
            headers: {
                Authorization: `Bearer ${store.token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                ...(typeof options.body === "string" ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {}),
            },
        });
        if (!response.ok) {
            let message = response.statusText;
            try {
                message = (await response.json()).message || message;
            } catch {}
            throw Object.assign(new Error(message), { status: response.status });
        }
        return response;
    }

    const json = async (store, path, options) => (await call(store, path, options)).json();

    // base64 of bytes
    const bytesToBase64 = (bytes) => {
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
    };
    const toBase64 = (text) => bytesToBase64(new TextEncoder().encode(text));

    // The path of a file of the app, as the repository has it
    const inRepo = (store, path) => [store.root, path].filter(Boolean).join("/").replace(/\/+$/, "");
    const contentsUrl = (store, path) => {
        const full = inRepo(store, path);
        return `/repos/${store.owner}/${store.repo}/contents${full ? `/${encode(full)}` : ""}`;
    };

    // The same thing is done again when another save got in first
    async function again(task) {
        for (let attempt = 1; ; attempt++) {
            try {
                return await task();
            } catch (error) {
                if (error.status !== 409 || attempt >= TRIES) throw error;
                await wait(300 * attempt);
            }
        }
    }

    const storage = {
        // Opens the folder of an app. Rejects with an error whose code is "signedOut", "noWrite", or "failed".
        connect(app) {
            return storage.open(app, `${APPS}/${app}`);
        },

        // Opens the whole repository: the Drive, as a file explorer shows it.
        async drive() {
            const store = await storage.open("drivemu", "");
            store.system = SYSTEM;
            store.own = `${APPS}/drivemu`;   // the folder of the data of Drivemu itself (a json file, say): the reset of the Drive deletes it too
            return store;
        },

        async open(app, root) {
            const account = window.account?.get();
            if (!account) throw fail("signedOut");
            const brand = await (await fetch(BRAND, { cache: "no-store" })).json();
            const store = { token: account.token, owner: account.login, repo: `${brand.id}-data`, app, root };

            try {
                store.info = await json(store, `/repos/${store.owner}/${store.repo}`);
            } catch (error) {
                if (error.status !== 404) throw error;
                try {
                    store.info = await json(store, "/user/repos", {
                        method: "POST",
                        body: JSON.stringify({ name: store.repo, private: true, description: `${brand.name} data` }),   // no auto_init: GitHub would add a README.md that nobody asked for
                    });
                    await wait(1500); // GitHub needs a moment to set the repository up
                } catch (create) {
                    if (create.status !== 422) throw create;   // the name is taken: another page made the repository a moment ago
                    store.info = await json(store, `/repos/${store.owner}/${store.repo}`);
                }
            }
            if (!store.info.permissions?.push) throw fail("noWrite");
            store.branch = store.info.default_branch || "main";

            await storage.ensureBranch(store);
            return store;
        },

        // The branch has a commit. A repository that was just made is empty, and the git data API (what Drivemu uses for many files at once) does not work in an empty one
        // (it answers 409; GitHub says so and gives the way out, the contents API, in https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-your-git-database):
        // the first commit is made here, through the contents API, with an empty file in AppData (the first file of any app that comes after goes next to it).
        async ensureBranch(store) {
            try {
                await call(store, `/repos/${store.owner}/${store.repo}/git/ref/heads/${encodeURIComponent(store.branch)}`);
            } catch (error) {
                if (error.status !== 404 && error.status !== 409) throw error;
                try {
                    await call(store, `/repos/${store.owner}/${store.repo}/contents/${APPS}/.gitkeep`, { method: "PUT", body: JSON.stringify({ message: "Initialize", content: "" }) });
                } catch (put) {
                    if (put.status !== 422 && put.status !== 409) throw put;   // the file is there: another page made it first
                }
            }
        },

        // The text of a file of the folder, or null when it is not there.
        async readFile(store, path) {
            try {
                const response = await call(store, `${contentsUrl(store, path)}?ref=${encodeURIComponent(store.branch)}`, {
                    headers: { Accept: "application/vnd.github.raw+json" },
                });
                return await response.text();
            } catch (error) {
                if (error.status === 404) return null;
                throw error;
            }
        },

        // The files of a folder inside the folder of the app: [{ name, sha }] (empty when the folder is not there yet).
        async list(store, folder) {
            try {
                const items = await json(store, `${contentsUrl(store, folder)}?ref=${encodeURIComponent(store.branch)}`);
                return Array.isArray(items) ? items.filter((item) => item.type === "file").map(({ name, sha }) => ({ name, sha })) : [];
            } catch (error) {
                if (error.status === 404) return [];
                throw error;
            }
        },

        // Every file of the folder of the app, in every folder, in one call: { files: [{ path, size }], truncated }.
        // The paths are inside the folder of the app. truncated is true when the folder is too big for GitHub to list in one answer.
        async tree(store) {
            const base = `/repos/${store.owner}/${store.repo}/git/trees`;
            if (!store.root) {   // the Drive: the whole repository
                const whole = await json(store, `${base}/${encodeURIComponent(store.branch)}?recursive=1`);
                return { files: whole.tree.filter((item) => item.type === "blob").map(({ path, size }) => ({ path, size })), truncated: !!whole.truncated };
            }
            // the folder of the app is found one folder at a time, so the files of the other apps are not listed with it
            let sha = encodeURIComponent(store.branch);
            for (const name of store.root.split("/")) {
                const level = await json(store, `${base}/${sha}`);
                const next = level.tree.find((item) => item.type === "tree" && item.path === name);
                if (!next) return { files: [], truncated: false };
                sha = next.sha;
            }
            const tree = await json(store, `${base}/${sha}?recursive=1`);
            return { files: tree.tree.filter((item) => item.type === "blob").map(({ path, size }) => ({ path, size })), truncated: !!tree.truncated };
        },

        // The bytes of a file of the folder (a Uint8Array), or null when it is not there.
        async readBinary(store, path) {
            try {
                const response = await call(store, `${contentsUrl(store, path)}?ref=${encodeURIComponent(store.branch)}`, {
                    headers: { Accept: "application/vnd.github.raw+json" },
                });
                return new Uint8Array(await response.arrayBuffer());
            } catch (error) {
                if (error.status === 404) return null;
                throw error;
            }
        },

        // Saves a file of the folder (a new one, or a new version of it). Gives the sha of the new version.
        async writeFile(store, path, text, message = `${store.app}: save ${path}`) {
            return storage.put(store, path, toBase64(text), message);
        },

        async writeBinary(store, path, bytes, message = `${store.app}: save ${path}`) {
            return storage.put(store, path, bytesToBase64(bytes), message);
        },

        async put(store, path, content, message) {
            const url = contentsUrl(store, path);
            return again(async () => {
                let sha;
                try {
                    sha = (await json(store, `${url}?ref=${encodeURIComponent(store.branch)}`)).sha;
                } catch (error) {
                    if (error.status !== 404) throw error;
                }
                const saved = await json(store, url, { method: "PUT", body: JSON.stringify({ message, content, branch: store.branch, ...(sha ? { sha } : {}) }) });
                return saved.content.sha;
            });
        },

        // Deletes a file of the folder (nothing happens when it is not there).
        async removeFile(store, path, message = `${store.app}: delete ${path}`) {
            const url = contentsUrl(store, path);
            await again(async () => {
                let sha;
                try {
                    sha = (await json(store, `${url}?ref=${encodeURIComponent(store.branch)}`)).sha;
                } catch (error) {
                    if (error.status === 404) return;
                    throw error;
                }
                await call(store, url, { method: "DELETE", body: JSON.stringify({ message, sha, branch: store.branch }) });
            });
        },
    };

    window.storage = storage;
})();
