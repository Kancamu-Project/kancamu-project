// The settings of the webs, shared by every web (they all run on one origin).
// Everything of a web that the user can adjust (except how a list is shown and sorted) is one of its settings, kept in localStorage under "<app>.settings",
// and can be set in the account web (/accountmu/?page=settings&app=<app>, opened by the account button of the web). A web has no settings screen of its own,
// but it can keep a control for a setting in its page: the control and the account web write the same settings, and each follows the other.
//   settings.set("muai", values)               saves the settings of the app (the control of a web, and the account web)
//   settings.get("muai", defaults)              the settings of the app: the defaults, over which the saved values
//   settings.onChange("muai", defaults, fn)     runs fn(settings) when the account web saves a change
//   settings.listen("muai", fn)                 runs fn(message) when the account web did something to the data of the app
//                                               (deleted its chats, reset its drive...), so the app shows what is left
// Only the account web calls reset and announce.
(() => {
    const key = (app) => `${app}.settings`;

    const read = (app) => {
        try {
            return JSON.parse(localStorage.getItem(key(app))) || {};
        } catch {
            return {};
        }
    };

    window.settings = {
        get: (app, defaults = {}) => ({ ...defaults, ...read(app) }),

        onChange(app, defaults, fn) {
            window.addEventListener("storage", (event) => {
                if (event.key === key(app) || event.key === null) fn(this.get(app, defaults));
            });
        },

        listen(app, fn) {
            const channel = new BroadcastChannel(`kancamu-${app}`);
            channel.onmessage = (event) => fn(event.data);
        },

        set(app, values) {
            try {
                localStorage.setItem(key(app), JSON.stringify(values));
            } catch {}
        },
        // The account web only:
        reset(app) {
            try {
                localStorage.removeItem(key(app));
            } catch {}
        },
        announce(app, message) {
            const channel = new BroadcastChannel(`kancamu-${app}`);
            channel.postMessage(message);
            channel.close();
        },
    };
})();
