// Everything that pops up over the page, in every app: the questions and messages (dialogs) and the short notes (toasts).
// An app never uses alert, confirm, or prompt of the browser, and never makes a popup of its own. The look is in assets/css/style.css (.shared-dialog*, .shared-toast*), the same in every app.
//
// A dialog, which waits for an answer:
//   if (await popups.ask({ text: "Delete this chat?", ok: "Delete" })) { ... }       true when the user confirms, false when not
//   const name = await popups.ask({ text: "Chat name:", value: "Old name" });         the text the user typed, or null when cancelled
//   await popups.tell({ text: "Saved." });                                            a message with one button
//   The options are text, title, ok, cancel (the texts of the buttons; they are in the language of the page when not given), value, and kind (the border: info, warning, error, or success; none is the normal border).
//
// A sheet, a panel at an edge of the page (a drawer is a sheet at the bottom); it waits until it is closed:
//   await popups.sheet({ title: "Edit profile", text: "What is in it.", side: "end" });    side: start, end (the default), top, or bottom
//   await popups.sheet({ title: "Filters", node: someElement, side: "bottom" });             a node instead of a text
//
// A command, a search with a list under it; it gives the value of the item that is picked, or null:
//   const value = await popups.command({ items: [{ label: "Open", hint: "Ctrl O", value: "open" }] });
//
// A toast, a short note at the bottom of the page that goes away by itself:
//   popups.toast("Copied.");
//   popups.toast("Failed.", { kind: "error" });                                       the kind gives the colour of the border and the icon
//   const note = popups.toast("Deleting...", { kind: "info", duration: 0 });          stays until it is closed
//   note.set("Still deleting..."); note.close();
//   const bar = popups.toast("Uploading...", { duration: 0, progress: 0 });           with a progress bar (0 to 1)
//   bar.set("Uploading 3 of 9", 0.33); bar.close();
//   The options are kind, duration (milliseconds; 0 stays until closed), and progress.
//   The kinds are the colours with their meaning: success (green, a good thing, the default), info (blue, neutral, the default with progress),
//   warning (yellow, be careful), and error (red, a bad or sensitive thing: a failure, a deletion). An error and a warning stay longer.
//
// The texts of the buttons are in assets/data/popup.json, in every supported language. The page needs assets/js/i18n.js before this script.
(() => {
    const TEXTS = new URL("../data/popup.json", document.currentScript.src).href;
    const TOAST_TIME = 3500;
    const TOAST_TIME_LONG = 6000;
    let texts = null;
    let element = null;
    let list = null;
    // The element of the body that holds every popup (#popups in the page); a page that has none gets it here.
    const root = () => document.getElementById("popups") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "popups", className: "popups" }));

    async function load() {
        texts ??= await (await fetch(TEXTS, { cache: "no-store" })).json();
    }

    // A text of popup.json in the language of the page.
    const say = (key) => (window.i18n ? window.i18n.pick(texts[key]) : texts[key]["en-US"]);

    function part(tag, className, parent, hidden = false) {
        const node = document.createElement(tag);
        node.className = className + (hidden ? " hidden" : "");
        parent.appendChild(node);
        return node;
    }

    /* ---------- dialogs ---------- */

    // The dialog is made once, when it is first needed.
    function build() {
        const dialog = document.createElement("dialog");
        dialog.className = "shared-dialog";
        const form = part("form", "shared-dialog-form", dialog);
        form.method = "dialog";
        const parts = {
            dialog,
            form,
            title: part("h2", "shared-dialog-title", form, true),
            text: part("span", "shared-dialog-text", form),
            input: part("input", "shared-dialog-input", form, true),
        };
        parts.input.type = "text";
        const actions = part("div", "shared-dialog-actions", form);
        parts.cancel = part("button", "shared-dialog-cancel", actions);
        parts.cancel.type = "button";
        parts.confirm = part("button", "shared-dialog-confirm primary", actions);
        parts.confirm.type = "submit";
        for (const button of [parts.cancel, parts.confirm]) button.appendChild(document.createElement("span"));
        root().appendChild(dialog);
        return parts;
    }

    async function show({ text = "", title = "", ok, cancel, value = null, single = false, kind = "" }) {
        await load();
        element ??= build();
        const { dialog, form, input } = element;
        // a dialog that is still open (another question at the same time) is closed first
        if (dialog.open) dialog.close();
        dialog.dataset.kind = kind;
        element.title.textContent = title;
        element.title.classList.toggle("hidden", !title);
        element.text.textContent = text;
        element.text.classList.toggle("hidden", !text);
        element.confirm.firstChild.textContent = ok ?? say("ok");
        element.cancel.firstChild.textContent = cancel ?? say("cancel");
        element.cancel.classList.toggle("hidden", single);
        input.classList.toggle("hidden", value === null);
        input.setAttribute("aria-label", text || title);
        if (value !== null) input.value = value;

        return new Promise((resolve) => {
            let answer = value === null ? false : null;
            form.onsubmit = () => {
                answer = value === null ? true : input.value;
            };
            element.cancel.onclick = () => dialog.close();
            dialog.addEventListener("close", () => resolve(answer), { once: true });
            dialog.showModal();
            if (value !== null) {
                input.focus();
                input.select();
            } else element.confirm.focus();
        });
    }

    /* ---------- the sheet and the command ---------- */

    // A dialog that is made for one use and removed when it closes.
    function temporary(className) {
        const dialog = document.createElement("dialog");
        dialog.className = className;
        root().appendChild(dialog);
        // a click on the backdrop closes it
        dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
        return dialog;
    }

    async function sheet({ title = "", text = "", node = null, side = "end" }) {
        await load();
        const dialog = temporary("shared-sheet");
        dialog.dataset.side = side;
        const header = part("div", "shared-sheet-header", dialog);
        part("h2", "shared-sheet-title", header).textContent = title;
        const close = part("button", "shared-sheet-close", header);
        close.type = "button";
        close.textContent = say("close");
        close.addEventListener("click", () => dialog.close());
        const body = part("div", "shared-sheet-body", dialog);
        if (node) body.appendChild(node);
        else body.textContent = text;
        return new Promise((resolve) => {
            dialog.addEventListener("close", () => { dialog.remove(); resolve(); }, { once: true });
            dialog.showModal();
            close.focus();
        });
    }

    async function command({ items = [], placeholder }) {
        await load();
        const dialog = temporary("shared-command");
        const input = part("input", "shared-command-input", dialog);
        input.type = "text";
        input.placeholder = placeholder ?? say("search");
        input.setAttribute("aria-label", input.placeholder);
        const list = part("div", "shared-command-list", dialog);
        let shown = items;
        let active = 0;
        let picked = null;
        const draw = () => {
            list.replaceChildren();
            if (!shown.length) part("span", "shared-command-empty", list).textContent = say("empty");
            shown.forEach((item, index) => {
                const button = part("button", "shared-command-item" + (index === active ? " on" : ""), list);
                button.type = "button";
                part("span", "", button).textContent = item.label;
                if (item.hint) part("span", "shared-command-hint", button).textContent = item.hint;
                button.addEventListener("click", () => { picked = item.value; dialog.close(); });
            });
        };
        input.addEventListener("input", () => {
            const query = input.value.trim().toLowerCase();
            shown = items.filter((item) => item.label.toLowerCase().includes(query));
            active = 0;
            draw();
        });
        input.addEventListener("keydown", (event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (shown.length) active = (active + (event.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length;
                draw();
                list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
            } else if (event.key === "Enter" && shown[active]) {
                event.preventDefault();
                picked = shown[active].value;
                dialog.close();
            }
        });
        draw();
        return new Promise((resolve) => {
            dialog.addEventListener("close", () => { dialog.remove(); resolve(picked); }, { once: true });
            dialog.showModal();
            input.focus();
        });
    }

    /* ---------- toasts ---------- */

    // The list is a popover, so it is in the top layer: a toast shows above an open dialog too.
    function buildList() {
        const node = document.createElement("div");
        node.className = "shared-toasts";
        node.setAttribute("popover", "manual");
        node.setAttribute("role", "status");
        node.setAttribute("aria-live", "polite");
        root().appendChild(node);
        return node;
    }

    function toast(text, { progress = null, kind = progress === null ? "success" : "info", duration = kind === "error" || kind === "warning" ? TOAST_TIME_LONG : TOAST_TIME } = {}) {
        list ??= buildList();
        const note = part("div", `shared-toast ${kind}` + (progress === null ? "" : " with-bar"), list);
        part("span", "shared-toast-icon", note);
        const label = part("span", "shared-toast-text", note);
        label.textContent = text;
        const fill = progress === null ? null : part("i", "shared-toast-fill", part("div", "shared-toast-bar", note));
        let timer = 0;

        const close = () => {
            clearTimeout(timer);
            note.remove();
            if (!list.children.length && list.matches(":popover-open")) list.hidePopover();
        };
        const set = (newText, newProgress) => {
            if (newText !== undefined) label.textContent = newText;
            if (fill && newProgress !== undefined) fill.style.width = Math.round(newProgress * 100) + "%";
        };
        set(undefined, progress ?? 0);

        // shown again each time, so it is above anything opened since the last toast
        if (list.matches(":popover-open")) list.hidePopover();
        list.showPopover();
        if (duration) timer = setTimeout(close, duration);
        return { set, close };
    }

    window.popups = {
        ask: (options = {}) => show(options),
        tell: (options = {}) => show({ ...options, single: true }),
        sheet,
        command,
        toast,
    };
})();
