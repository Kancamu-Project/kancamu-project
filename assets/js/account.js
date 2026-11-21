// The GitHub sign-in shared by every web (they all run on one origin).
// The account is kept in localStorage under the key "account" as { token, login, name, avatar }.
// Sign in once in any web and every other web, open or opened later, knows it.
// Only a personal access token (classic) is accepted for now.
//
// The sign-in screen, the profile, and the settings of every web are pages of the account web (/youmu), chosen by the query string
// (?page=login, ?page=profile, ?page=settings&app=<app>), so no other web builds its own:
//   account.open()              opens the account web in a dialog over the current page: the profile, or the sign-in when there is no account
//   account.open("settings")    opens a page of it: "login", "profile", or "settings"
//   account.bind(btn)           makes a button with the class "account" open the settings of the web (the profile or the sign-in when the web has none),
//                               and show the avatar when signed in
// A web has one button for all of it. The dialog knows the web that opened it (the first folder of the address, such as muai), so it opens on the settings
// of that web; the sidebar of the account web has the profile and the settings of every other web.
(() => {
    const PAGE = new URL("../../youmu/", document.currentScript.src).href;
    const KEY = "account";
    const listeners = [];

    const read = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY));
            return saved && saved.token ? saved : null;
        } catch {
            return null;
        }
    };

    const notify = () => listeners.forEach((listener) => listener(read()));

    const fail = (code) => Object.assign(new Error(code), { code });

    const account = {
        // The signed-in account, or null.
        get: read,

        // Checks the token with GitHub and signs in. Rejects with an error whose code is
        // "empty", "classic" (a fine-grained token), "invalid" (GitHub refused it), or "failed".
        async signIn(token) {
            token = (token || "").trim();
            if (!token) throw fail("empty");
            if (token.startsWith("github_pat_")) throw fail("classic");
            let response;
            try {
                response = await fetch("https://api.github.com/user", {
                    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
                });
            } catch {
                throw fail("failed");
            }
            if (response.status === 401) throw fail("invalid");
            if (!response.ok) throw fail("failed");
            const user = await response.json();
            this.set({ token, login: user.login, name: user.name || user.login, avatar: user.avatar_url });
        },

        // Saves an account that a web has already checked itself.
        set(info) {
            try {
                localStorage.setItem(KEY, JSON.stringify(info));
            } catch {}
            notify();
        },

        signOut() {
            try {
                localStorage.removeItem(KEY);
            } catch {}
            notify();
        },

        // Opens the account web in a dialog (it closes itself). page: "login", "profile", or "settings".
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

        // A button with the class "account": it opens the dialog on the settings of this web, and shows the avatar once signed in.
        bind(button) {
            const render = (user) => {
                button.classList.toggle("signed-in", !!user);
                button.style.backgroundImage = user ? `url("${user.avatar}")` : "";
            };
            button.addEventListener("click", () => this.open("settings"));
            this.onChange(render);
            render(read());
        },

        // Runs fn(account) after every change, also one made in another web.
        onChange(fn) {
            listeners.push(fn);
        },
    };

    window.addEventListener("storage", (event) => {
        if (event.key === KEY || event.key === null) notify();
    });

    window.account = account;
})();
