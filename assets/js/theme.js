// Runs before first paint so a saved light theme does not flash dark.
// Also follows the theme chosen in any other app of this site (same origin) while this page is open.
// The effects of the Appearance page of the account app are applied here too, as layers: a div of its own (div.effect, directly in the body) for each effect that is on, and none
// when it is off (the look is in assets/css/style.css). Nothing is written on html, on body, or on any other element, and no style of the page is changed. They are the settings
// "appearance" (localStorage "appearance.settings"), and there is nothing to add until the user turns one on, so nothing is written here as a default.
(() => {
    // The apps have no default menu on a right click (the ones that have a menu of their own make it themselves)
    document.addEventListener("contextmenu", (event) => event.preventDefault());
    const read = () => {
        try {
            return localStorage.getItem("theme") === "light" ? "light" : "dark";
        } catch {
            return "dark";
        }
    };
    document.documentElement.dataset.theme = read();
    window.addEventListener("storage", (event) => {
        if (event.key === "theme" || event.key === null) document.documentElement.dataset.theme = read();
    });

    // An app in a tab of the main website is under the layers of the main website (they cover its frames): it adds none, or the noise would be twice as strong.
    // An app in a dialog (the account app) is not: the dialog is over the layers, so it has its own.
    const covered = () => {
        try {
            return window.parent !== window && !!window.parent.document.getElementById("viewer")?.contains(window.frameElement);
        } catch {
            return false;
        }
    };

    // The layers that are in the page now: name -> div
    const layers = new Map();
    const effects = () => {
        let saved = {};
        try {
            if (!covered()) saved = JSON.parse(localStorage.getItem("appearance.settings")) || {};
        } catch {}
        if (!document.body) {   // the script runs in the head: the layers wait for the body
            document.addEventListener("DOMContentLoaded", effects, { once: true });
            return;
        }
        // an effect that is on has its div in the body (its amount, 0 to 100, is a variable of the div itself); one that is off has none
        const set = (name, on, amount, moving = false) => {
            let layer = layers.get(name);
            if (on !== true) {
                layer?.remove();
                layers.delete(name);
                return;
            }
            if (!layer) {
                layer = document.createElement("div");
                layer.className = `effect effect-${name}`;
                layer.setAttribute("aria-hidden", "true");
                layers.set(name, layer);
            }
            if (!layer.isConnected) document.body.append(layer);
            layer.classList.toggle("moving", moving);
            if (Number.isFinite(Number(amount))) layer.style.setProperty("--effect-amount", String(Math.min(100, Math.max(0, Number(amount)))));
        };
        set("monochrome", saved.monochrome, saved.monochromeAmount);
        set("noise", saved.noise, saved.noiseAmount, saved.noiseMotion === true);
    };
    effects();
    window.addEventListener("storage", (event) => {
        if (event.key === "appearance.settings" || event.key === null) effects();
    });
    // a change made in this page (the account app shows it at once): assets/js/settings.js says it
    window.addEventListener("kancamu:settings", (event) => {
        if (event.detail?.app === "appearance") effects();
    });
})();
