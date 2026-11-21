// The GitHub storage shared by the webs that keep data for the user (they all run on one origin).
// One private repository named after the brand (<id>-data, with the id of assets/data/brand.json),
// and one branch per app, named after the app (drivemu, muai). An app only touches its own branch.
//   const store = await storage.connect("muai");           opens the branch, creating the repository and the branch if needed
//   const text = await storage.readFile(store, "a.json");  the text of a file of the branch, or null
//   await storage.writeFile(store, "a.json", text);        saves a file of the branch, and gives its new sha
//   await storage.list(store, "folder");                   [{ name, sha }] of a folder of the branch
//   await storage.tree(store);                             { files: [{ path, size }], truncated } every file of the branch, in every folder
//   await storage.readBinary(store, "a.jpg");              the bytes of a file (a Uint8Array), or null
//   await storage.writeBinary(store, "a.jpg", bytes);      saves bytes
//   await storage.removeFile(store, "a.json");             deletes a file
// The account (assets/js/account.js) must be signed in.
(() => {
    const BRAND = new URL("../data/brand.json", document.currentScript.src).href;
    const API = "https://api.github.com";

    const fail = (code, message = code) => Object.assign(new Error(message), { code });

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

    const storage = {
        // Opens the branch of an app. Rejects with an error whose code is "signedOut", "noWrite", or "failed".
        async connect(app) {
            const account = window.account?.get();
            if (!account) throw fail("signedOut");
            const brand = await (await fetch(BRAND, { cache: "no-store" })).json();
            const store = { token: account.token, owner: account.login, repo: `${brand.id}-data`, branch: app };

            try {
                store.info = await json(store, `/repos/${store.owner}/${store.repo}`);
            } catch (error) {
                if (error.status !== 404) throw error;
                store.info = await json(store, "/user/repos", {
                    method: "POST",
                    body: JSON.stringify({ name: store.repo, private: true, auto_init: true, description: `${brand.name} data` }),
                });
                await new Promise((resolve) => setTimeout(resolve, 1500)); // GitHub needs a moment to set the repository up
            }
            if (!store.info.permissions?.push) throw fail("noWrite");

            await storage.ensureBranch(store);
            return store;
        },

        // The branch of the app: an orphan branch (no history shared with the others), made once.
        async ensureBranch(store) {
            const ref = `/repos/${store.owner}/${store.repo}/git/ref/heads/${store.branch}`;
            try {
                await call(store, ref);
                return;
            } catch (error) {
                if (error.status !== 404 && error.status !== 409) throw error;
            }
            const base = `/repos/${store.owner}/${store.repo}`;
            try {
                const blob = await json(store, `${base}/git/blobs`, { method: "POST", body: JSON.stringify({ content: "", encoding: "utf-8" }) });
                const tree = await json(store, `${base}/git/trees`, {
                    method: "POST",
                    body: JSON.stringify({ tree: [{ path: ".gitkeep", mode: "100644", type: "blob", sha: blob.sha }] }),
                });
                const commit = await json(store, `${base}/git/commits`, {
                    method: "POST",
                    body: JSON.stringify({ message: `${store.branch}: create the branch`, tree: tree.sha, parents: [] }),
                });
                await json(store, `${base}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${store.branch}`, sha: commit.sha }) });
            } catch (error) {
                if (error.status === 422) return; // another page made it first
                if (error.status !== 409) throw error;
                // a repository with no commit yet: the first file makes the default branch, then the branch can be made
                await call(store, `${base}/contents/README.md`, { method: "PUT", body: JSON.stringify({ message: "Initialize", content: "" }) });
                await storage.ensureBranch(store);
            }
        },

        // The text of a file of the branch, or null when it is not there.
        async readFile(store, path) {
            try {
                const response = await call(store, `/repos/${store.owner}/${store.repo}/contents/${path}?ref=${store.branch}`, {
                    headers: { Accept: "application/vnd.github.raw+json" },
                });
                return await response.text();
            } catch (error) {
                if (error.status === 404) return null;
                throw error;
            }
        },

        // The files of a folder of the branch: [{ name, sha }] (empty when the folder is not there yet).
        async list(store, folder) {
            try {
                const items = await json(store, `/repos/${store.owner}/${store.repo}/contents/${folder}?ref=${store.branch}`);
                return Array.isArray(items) ? items.filter((item) => item.type === "file").map(({ name, sha }) => ({ name, sha })) : [];
            } catch (error) {
                if (error.status === 404) return [];
                throw error;
            }
        },

        // Every file of the branch, in every folder, in one call: { files: [{ path, size }], truncated }.
        // truncated is true when the branch is too big for GitHub to list in one answer.
        async tree(store) {
            const tree = await json(store, `/repos/${store.owner}/${store.repo}/git/trees/${encodeURIComponent(store.branch)}?recursive=1`);
            return { files: tree.tree.filter((item) => item.type === "blob").map(({ path, size }) => ({ path, size })), truncated: !!tree.truncated };
        },

        // The bytes of a file of the branch (a Uint8Array), or null when it is not there.
        async readBinary(store, path) {
            try {
                const response = await call(store, `/repos/${store.owner}/${store.repo}/contents/${path}?ref=${store.branch}`, {
                    headers: { Accept: "application/vnd.github.raw+json" },
                });
                return new Uint8Array(await response.arrayBuffer());
            } catch (error) {
                if (error.status === 404) return null;
                throw error;
            }
        },

        // Saves a file of the branch (a new one, or a new version of it). Gives the sha of the new version.
        async writeFile(store, path, text, message = `${store.branch}: save ${path}`) {
            return storage.put(store, path, toBase64(text), message);
        },

        async writeBinary(store, path, bytes, message = `${store.branch}: save ${path}`) {
            return storage.put(store, path, bytesToBase64(bytes), message);
        },

        async put(store, path, content, message) {
            const url = `/repos/${store.owner}/${store.repo}/contents/${path}`;
            let sha;
            try {
                sha = (await json(store, `${url}?ref=${store.branch}`)).sha;
            } catch (error) {
                if (error.status !== 404) throw error;
            }
            const saved = await json(store, url, { method: "PUT", body: JSON.stringify({ message, content, branch: store.branch, ...(sha ? { sha } : {}) }) });
            return saved.content.sha;
        },

        // Deletes a file of the branch (nothing happens when it is not there).
        async removeFile(store, path, message = `${store.branch}: delete ${path}`) {
            const url = `/repos/${store.owner}/${store.repo}/contents/${path}`;
            let sha;
            try {
                sha = (await json(store, `${url}?ref=${store.branch}`)).sha;
            } catch (error) {
                if (error.status === 404) return;
                throw error;
            }
            await call(store, url, { method: "DELETE", body: JSON.stringify({ message, sha, branch: store.branch }) });
        },
    };

    window.storage = storage;
})();
