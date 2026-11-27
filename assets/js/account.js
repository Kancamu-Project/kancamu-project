// The GitHub sign-in shared by every app (they all run on one origin).
// The account is kept in localStorage under the key "account" as { token, login, name, avatar }.
// Sign in once in any app and every other app, open or opened later, knows it.
// The sign-in is "Sign in with GitHub" (an OAuth App): account.signInWithGitHub() sends the whole page to GitHub, GitHub sends it back to youmu/callback.html,
// and account.finishSignIn() trades the code for a token through the Worker of kancamu-auth (the only place that knows the client secret).
// The token has the scope "repo" (assets/data/auth.json), because the storage of the apps is a private repository of the user.
// A token that GitHub made to expire is not an account any more once it has: the apps ask for the sign-in again.
//
// The sign-in screen, the profile, and the settings of every app are pages of the account app (/youmu), chosen by the query string
// (?page=login, ?page=profile, ?page=settings&app=<app>), so no other web builds its own:
//   account.open()              opens the account app in a dialog over the current page: the profile, or the sign-in when there is no account
//   account.open("settings")    opens a page of it: "login", "profile", or "settings"
//   account.bind(btn)           makes a button with the class "account" open the settings of the app (the profile or the sign-in when the app has none),
//                               and show the avatar when signed in
// An app has one button for all of it. The dialog knows the app that opened it (the first folder of the address, such as muai), so it opens on the settings
// of that app; the sidebar of the account app has the profile and the settings of every other app.
(() => {
    const PAGE = new URL("../../youmu/", document.currentScript.src).href;
    const KEY = "account";
    const PENDING = "account:pending";   // in sessionStorage: what the callback needs to finish the sign-in that this tab began
    const CONFIG = new URL("../data/auth.json", document.currentScript.src).href;
    const CALLBACK = new URL("callback.html", PAGE).href;
    const OAUTH_TOKEN = /^gh[ou]_/;   // the token of the sign-in with GitHub (gho_ for an OAuth App)
    const listeners = [];

    // Nothing but the sign-in with GitHub makes an account: a token that is not one of its own (pasted in an older version) is deleted at once
    try {
        const old = JSON.parse(localStorage.getItem(KEY));
        if (old && !OAUTH_TOKEN.test(old.token || "")) localStorage.removeItem(KEY);
    } catch {}

    const read = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY));
            return saved && OAUTH_TOKEN.test(saved.token || "") && !(saved.expiresAt && saved.expiresAt <= Date.now()) ? saved : null;
        } catch {
            return null;
        }
    };

    const notify = () => listeners.forEach((listener) => listener(read()));

    const fail = (code) => Object.assign(new Error(code), { code });

    // PKCE: a secret that only this tab knows (the verifier) and its hash (the challenge) that GitHub keeps, so a stolen code is of no use.
    const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const randomString = (length) => base64url(crypto.getRandomValues(new Uint8Array(length)));
    const challengeOf = async (verifier) => base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));

    // The client id (public), the scope, and the address of the Worker: the local one on localhost, the other everywhere else.
    async function loadConfig() {
        let config;
        try {
            config = await (await fetch(CONFIG)).json();
        } catch {
            throw fail("failed");
        }
        const worker = location.hostname === "localhost" ? config.worker?.local : config.worker?.production;
        if (!config.clientId || !worker) throw fail("config");
        return { clientId: config.clientId, scope: config.scope || "", worker };
    }

    const account = {
        // The signed-in account, or null.
        get: read,

        // Sends the whole page to GitHub (it cannot show its page in a frame, so the dialog of the account is left too).
        // Rejects with an error whose code is "config" (no Worker is set for this address in assets/data/auth.json) or "failed".
        async signInWithGitHub() {
            const config = await loadConfig();
            const state = randomString(24);
            const verifier = randomString(48);
            const challenge = await challengeOf(verifier);
            try {
                sessionStorage.setItem(PENDING, JSON.stringify({ state, verifier, returnTo: window.top.location.href, at: Date.now() }));
            } catch {
                throw fail("failed");
            }
            const url = new URL("https://github.com/login/oauth/authorize");
            url.search = new URLSearchParams({
                client_id: config.clientId,
                redirect_uri: CALLBACK,
                scope: config.scope,
                state,
                code_challenge: challenge,
                code_challenge_method: "S256",
            });
            window.top.location.assign(url.href);
        },

        // The callback page gives the code and the state that GitHub sent back. Resolves with the address to go back to.
        // Rejects with an error whose code is "state" (not the sign-in that this tab began, or too old), "exchange", "config", or "failed".
        async finishSignIn({ code, state }) {
            let pending = null;
            try {
                pending = JSON.parse(sessionStorage.getItem(PENDING));
                sessionStorage.removeItem(PENDING);   // used once
            } catch {}
            if (!pending || !code || !state || state !== pending.state || Date.now() - pending.at > 10 * 60 * 1000) throw fail("state");
            const config = await loadConfig();
            let response;
            try {
                response = await fetch(`${config.worker}/token`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code, redirect_uri: CALLBACK, code_verifier: pending.verifier }),
                });
            } catch {
                throw fail("failed");
            }
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.access_token) throw fail(data.error === "bad_verification_code" ? "state" : "exchange");
            let user;
            try {
                const profile = await fetch("https://api.github.com/user", {
                    headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/vnd.github+json" },
                });
                if (!profile.ok) throw new Error("profile");
                user = await profile.json();
            } catch {
                throw fail("failed");
            }
            this.set({
                token: data.access_token,
                login: user.login,
                name: user.name || user.login,
                avatar: user.avatar_url,
                ...(data.expires_in ? { expiresAt: Date.now() + data.expires_in * 1000 } : {}),
            });
            return pending.returnTo || "";
        },

        // Saves an account that an app has already checked itself.
        set(info) {
            try {
                localStorage.setItem(KEY, JSON.stringify(info));
            } catch {}
            notify();
        },

        // Signs out, and takes the token back from GitHub (through the Worker) so that a copy of it stops working too.
        signOut() {
            const saved = read();
            try {
                localStorage.removeItem(KEY);
            } catch {}
            notify();
            if (saved) {
                loadConfig()
                    .then((config) => fetch(`${config.worker}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: saved.token }), keepalive: true }))
                    .catch(() => {});
            }
        },

        // Opens the account app in a dialog (it closes itself). page: "login", "profile", or "settings".
        open(page = "", app = location.pathname.split("/").filter(Boolean)[0] || "") {
            const url = new URL(PAGE);
            if (page) url.searchParams.set("page", page);
            if (app) url.searchParams.set("app", app);
            let dialog = document.querySelector("dialog.account-dialog");
            if (!dialog) {
                const frame = document.createElement("iframe");
                frame.src = url.href;
                dialog = document.createElement("dialog");
                dialog.className = "account-dialog";
                dialog.append(frame);
                dialog.addEventListener("click", (event) => {
                    if (event.target === dialog) dialog.close();
                });
                window.addEventListener("message", (event) => {
                    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
                    if (event.data?.type === "account:close") dialog.close();
                });
                document.body.append(dialog);
            }
            const frame = dialog.querySelector("iframe");
            if (frame.src !== url.href) frame.src = url.href;
            dialog.showModal();
            frame.contentWindow?.postMessage({ type: "account:focus" }, location.origin);
        },

        // A button with the class "account": it opens the dialog on the settings of this app, and shows the avatar once signed in.
        bind(button) {
            const render = (user) => {
                button.classList.toggle("signed-in", !!user);
                button.style.backgroundImage = user ? `url("${user.avatar}")` : "";
            };
            button.addEventListener("click", () => this.open("settings"));
            this.onChange(render);
            render(read());
        },

        // Runs fn(account) after every change, also one made in another app.
        onChange(fn) {
            listeners.push(fn);
        },
    };

    window.addEventListener("storage", (event) => {
        if (event.key === KEY || event.key === null) notify();
    });

    window.account = account;
})();
