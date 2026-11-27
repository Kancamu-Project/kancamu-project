// Where an app keeps what is on its screen, so a reload shows the same thing: the address of the page (its query string).
// An app reads it when it starts and writes it when the user changes something; it keeps only what is not the first value, so the address of a fresh page is clean.
//   const folder = urlState.get("path");                  the text of a parameter, or "" when it is not there
//   urlState.set({ path: "Images", view: "", q: "cat" }); writes the parameters that are given; "", null, undefined, and false take a parameter away
// The apps of Kancamu open in frames of the main site: the address of the frame is not the address that the user reloads, so every change is also told to the main site
// (it keeps the query string of each tab in its own address), and the main site opens the frame with it the next time. An app that is not in a frame only has its own address.
// The history is not filled: the address is replaced, not added to.
(() => {
    const read = () => new URLSearchParams(location.search);

    window.urlState = {
        get(name) {
            return read().get(name) || "";
        },

        // The parameters that are given, as an object ({ name: value }); the others stay as they are.
        set(values) {
            const params = read();
            for (const [name, value] of Object.entries(values)) {
                if (value === "" || value === null || value === undefined || value === false) params.delete(name);
                else params.set(name, String(value));
            }
            const search = params.toString();
            if (search === location.search.slice(1)) return;
            history.replaceState(null, "", location.pathname + (search ? `?${search}` : "") + location.hash);
            if (window.parent !== window) window.parent.postMessage({ type: "kancamu:url", search }, location.origin);
        },
    };
})();
