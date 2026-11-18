// Runs before first paint so a saved light theme does not flash dark.
try {
    document.documentElement.dataset.theme = localStorage.getItem("theme") === "light" ? "light" : "dark";
} catch {
    document.documentElement.dataset.theme = "dark";
}
