// TODO: this file and the main web work around what the browser does not give (see TODO.md, "Retest"). Retest it from time to time, to make it plain.
// Files of the Drive that can be dragged out of a web, with the types of drag that the browsers know.
//  - A picture is dragged as a real <img> with the whole picture, so the drop area of any web (ours or somebody else's) gets it as a file (dataTransfer.files), like a
//    file of the computer. A page cannot put a file in a drag by itself (Chrome drops it), so the file is given to the browser as a picture: an invisible <img> lies over
//    the element, and is the thing that is dragged.
//  - Any other file (a video, a document) is dragged as a link (text/uri-list) to the file, and its name (text/plain). The browsers have no drag that carries such a file
//    to another site; the webs of Kancamu take the link and read the file from it (transfer.take).
// The file has to be there when the drag starts, so it is read from the Drive while the pointer is over the element.
//   transfer.drag(element, source, region)   makes an element draggable as a file; source is { id, name, size, image, load }, or a function that gives it (for a
//                                            viewer that shows one file after another); load() gives the Blob. region is a function that gives the part of the element
//                                            where a picture is dragged (the whole element if left out).
//   await transfer.take(event)               the files of a drop: the ones of the computer, a picture of the Drive, or a file of the Drive that came as a link
//   The main web is told (a message to the parent page) which file a web drags, and gives it to the web of any tab as a real file (see script.js).
//   transfer.dragging                        true while a file of this page is being dragged (a page does not take its own file)
(() => {
    const LIMIT = 64 * 1024 * 1024;   // a bigger file is not dragged: it would take too long to read before the drag
    const KEPT = 8;                   // how many files stay ready
    const ready = new Map();          // id -> the address of the file
    const reading = new Set();

    const prepare = (source, done) => {
        if (reading.has(source.id) || source.size > LIMIT) return;
        reading.add(source.id);
        Promise.resolve(source.load())
            .then((blob) => {
                ready.set(source.id, URL.createObjectURL(blob));
                while (ready.size > KEPT) {
                    const [oldest, url] = ready.entries().next().value;
                    ready.delete(oldest);
                    URL.revokeObjectURL(url);
                }
                done();
            })
            .catch(() => {})
            .finally(() => reading.delete(source.id));
    };

    const tell = (message) => { if (window.parent !== window) window.parent.postMessage({ type: "kancamu:drag", ...message }, location.origin); };

    window.transfer = {
        dragging: false,

        drag(element, source, region) {
            const current = () => (typeof source === "function" ? source() : source);
            let handle = null;
            const sync = () => {
                const dragged = current();
                element.draggable = !!dragged && !dragged.image;   // a file that is not a picture is dragged by the element itself
                if (!dragged || !dragged.image) { handle?.remove(); handle = null; if (dragged && !ready.has(dragged.id)) prepare(dragged, () => {}); return; }
                const host = (region && region()) || element;
                if (!handle || handle.parentNode !== host) {
                    handle?.remove();
                    handle = new Image();
                    handle.alt = "";
                    handle.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;z-index:1;";
                    if (getComputedStyle(host).position === "static") host.style.position = "relative";
                    host.prepend(handle);
                    handle.addEventListener("dragstart", (event) => {
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setDragImage(host, event.offsetX, event.offsetY);
                        window.transfer.dragging = true;
                    });
                    handle.addEventListener("dragend", () => { window.transfer.dragging = false; });
                }
                if (handle.dataset.id !== dragged.id) { handle.dataset.id = dragged.id; handle.removeAttribute("src"); handle.style.pointerEvents = "none"; }
                const url = ready.get(dragged.id);
                if (url) { if (handle.getAttribute("src") !== url) handle.src = url; handle.style.pointerEvents = "auto"; }
                else prepare(dragged, sync);
            };
            for (const type of ["pointerenter", "pointermove", "focus"]) element.addEventListener(type, sync);
            element.addEventListener("dragstart", (event) => {
                const dragged = current();
                if (event.target !== element || !dragged || dragged.image) return;
                const url = ready.get(dragged.id);
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("text/plain", dragged.name);
                if (url) event.dataTransfer.setData("text/uri-list", `${url}#${encodeURIComponent(dragged.name)}`);
                window.transfer.dragging = true;
                if (url) tell({ on: true, url, name: dragged.name });
            });
            element.addEventListener("dragend", () => { window.transfer.dragging = false; tell({ on: false }); });
        },

        take(event) {
            const data = event.dataTransfer;
            const files = [...data.files];
            const link = data.getData("text/uri-list").split("\n").find((line) => line && !line.startsWith("#")) || "";   // read now: a drop gives its data only while it is handled
            if (files.length || !link.startsWith(`blob:${location.origin}/`)) return Promise.resolve(files);
            const name = decodeURIComponent(link.split("#")[1] || "file");
            return fetch(link).then((response) => response.blob()).then((blob) => [new File([blob], name, { type: blob.type })]).catch(() => []);
        },
    };
})();
