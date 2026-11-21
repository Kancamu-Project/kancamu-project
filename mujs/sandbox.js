// Where the code of a lesson runs. This page is loaded in a frame with sandbox="allow-scripts" (and nothing else), so it is a page of its own, with no access to muJS,
// to the account, or to the storage; and the code runs in a worker inside it, so a loop that never ends only freezes the worker (the page that hosts this frame
// removes the frame after a time).
// The page that hosts the frame sends { id, code, tests } and gets back { id, logs, mark, checks, error }:
//   logs    what the code printed with console.log (and info, debug, warn, error)
//   mark    how many of the logs were printed by the code itself, before the tests ran
//   checks  one { got } (the value as JSON, or "undefined") or { error } for every test that has an expression
//   error   the error that stopped the code, if there was one

// This function is the code of the worker (it is turned into text and run apart, so it cannot use anything outside it).
function worker() {
    const logs = [];
    const text = (value) => {
        if (typeof value === "string") return value;
        if (typeof value === "function") return String(value).split("\n")[0];
        if (value === undefined) return "undefined";
        if (typeof value === "bigint") return `${value}n`;
        try {
            const json = JSON.stringify(value);
            return json === undefined ? String(value) : json;
        } catch {
            return String(value);
        }
    };
    const printer = (prefix) => (...values) => {
        if (logs.length < 1000) logs.push(prefix + values.map(text).join(" ").slice(0, 500));
    };
    console.log = console.info = console.debug = printer("");
    console.warn = printer("warning: ");
    console.error = printer("error: ");

    // The lessons need no network and no storage: these are taken away (a help, not a wall: the wall is the frame, which has no origin and no rights).
    for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "Worker", "SharedWorker"]) {
        try { self[name] = undefined; } catch { /* kept */ }
    }

    let mark = 0;
    self.__mark = () => { mark = logs.length; };
    self.onmessage = ({ data: { id, code, tests } }) => {
        // The code and the tests run as one script, so the tests can see what the code declared with let and const.
        const checks = tests.filter((test) => test.expression).map((test) => `(() => { try { const value = (${test.expression}); return { got: value === undefined ? "undefined" : JSON.stringify(value) }; } catch (error) { return { error: String(error) }; } })()`);
        let error = null;
        try {
            (0, eval)(`${code}\n;__mark();\nself.__checks = [${checks.join(",")}];`);
        } catch (thrown) {
            error = `${thrown && thrown.name ? thrown.name : "Error"}: ${thrown && thrown.message ? thrown.message : thrown}`;
        }
        postMessage({ id, logs, mark: error ? logs.length : mark, checks: error ? [] : self.__checks || [], error });
    };
}

const source = URL.createObjectURL(new Blob([`(${worker})()`], { type: "text/javascript" }));
let running = null;
addEventListener("message", (event) => {
    if (event.source !== parent) return;
    running?.terminate();
    const { id } = event.data;
    try {
        running = new Worker(source);
    } catch (failure) {
        return parent.postMessage({ id, logs: [], mark: 0, checks: [], error: String(failure) }, "*");
    }
    running.onmessage = (answer) => parent.postMessage(answer.data, "*");
    running.onerror = (failure) => {
        failure.preventDefault();
        parent.postMessage({ id, logs: [], mark: 0, checks: [], error: failure.message || "Error" }, "*");
    };
    running.postMessage(event.data);
});
parent.postMessage({ ready: true }, "*");
