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

    for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "Worker", "SharedWorker"]) {
        try { self[name] = undefined; } catch { }
    }

    let mark = 0;
    self.__mark = () => { mark = logs.length; };
    self.onmessage = ({ data: { id, code, tests } }) => {
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
