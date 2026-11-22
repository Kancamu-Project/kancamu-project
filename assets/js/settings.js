// The settings of the apps, shared by every app (they all run on one origin).
// Everything of an app that the user can adjust (except how a list is shown and sorted) is one of its settings, kept in localStorage under "<app>.settings",
// and can be set in the account app (/youmu/?page=settings&app=<app>, opened by the account button of the app). An app has no settings screen of its own,
// but it can keep a control for a setting in its page: the control and the account app write the same settings, and each follows the other.
//   settings.set("muai", values)               saves the settings of the app (the control of an app, and the account app)
//   settings.get("muai", defaults)              the settings of the app: the defaults, over which the saved values
//   settings.onChange("muai", defaults, fn)     runs fn(settings) when the account app saves a change
//   settings.listen("muai", fn)                 runs fn(message) when the account app did something to the data of the app
//                                               (deleted its chats, reset its drive...), so the app shows what is left
// Only the account app calls reset and announce.
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
            window.dispatchEvent(new CustomEvent("kancamu:settings", { detail: { app } }));   // the "storage" event does not come to the page that wrote
        },
        // The account app only:
        reset(app) {
            try {
                localStorage.removeItem(key(app));
            } catch {}
            window.dispatchEvent(new CustomEvent("kancamu:settings", { detail: { app } }));
        },
        announce(app, message) {
            const channel = new BroadcastChannel(`kancamu-${app}`);
            channel.postMessage(message);
            channel.close();
        },
    };
})();
