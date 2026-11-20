// Runs before first paint so a saved light theme does not flash dark.
// Also follows the theme chosen in any other web of this site (same origin) while this page is open.
(() => {
    // The webs have no default menu on a right click (the ones that have a menu of their own make it themselves)
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
})();
