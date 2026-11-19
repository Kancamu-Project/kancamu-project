// The questions and messages of every web, in the page's own dialog. A web never uses alert, confirm, or prompt of the browser.
//   if (await dialogs.ask({ text: "Delete this chat?", ok: "Delete" })) { ... }       true when the user confirms, false when not
//   const name = await dialogs.ask({ text: "Chat name:", value: "Old name" });         the text the user typed, or null when cancelled
//   await dialogs.tell({ text: "Saved." });                                            a message with one button
// The options are text, title, ok, cancel (the texts of the buttons; they are in the language of the page when not given), and value.
// The texts of the buttons are in dialog.json next to this file, in every supported language. The page needs assets/i18n.js before this script.
(() => {
    const TEXTS = new URL("dialog.json", document.currentScript.src).href;
    let texts = null;
    let element = null;

    async function load() {
        texts ??= await (await fetch(TEXTS, { cache: "no-store" })).json();
    }

    // A text of dialog.json in the language of the page.
    const say = (key) => (window.i18n ? window.i18n.pick(texts[key]) : texts[key]["en-US"]);

    function part(tag, className, parent, hidden = false) {
        const node = document.createElement(tag);
        node.className = className + (hidden ? " hidden" : "");
        parent.appendChild(node);
        return node;
    }

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
        document.body.appendChild(dialog);
        return parts;
    }

    async function show({ text = "", title = "", ok, cancel, value = null, single = false }) {
        await load();
        element ??= build();
        const { dialog, form, input } = element;
        // a dialog that is still open (another question at the same time) is closed first
        if (dialog.open) dialog.close();
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

    window.dialogs = {
        ask: (options = {}) => show(options),
        tell: (options = {}) => show({ ...options, single: true }),
    };
})();
