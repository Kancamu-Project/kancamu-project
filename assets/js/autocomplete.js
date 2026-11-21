// Autocomplete for the search inputs of every web: while the user types, a list of suggestions shows under the input.
//   autocomplete.attach(input, { suggestions: () => ["Documents", "Images"] });
// suggestions gives the texts to offer (it is asked each time the user types, so it can follow what the page shows).
// A suggestion that is picked is put in the input, and the input gets an "input" event, so the search runs as if it was typed.
// Keys: arrow down and up move through the list, Enter picks the marked suggestion, Escape closes the list.
// The list is drawn by the page itself (not the datalist of the browser), in the style of the web (see assets/css/style.css).
(() => {
    const MAX = 6;
    let counter = 0;

    function attach(input, { suggestions, max = MAX }) {
        const id = `autocomplete-${++counter}`;
        const list = document.createElement("div");
        list.id = id;
        list.className = "autocomplete-list hidden";
        list.setAttribute("role", "listbox");
        document.body.appendChild(list);

        input.setAttribute("role", "combobox");
        input.setAttribute("aria-autocomplete", "list");
        input.setAttribute("aria-controls", id);
        input.setAttribute("aria-expanded", "false");
        input.autocomplete = "off";

        let options = [];
        let active = -1;

        const close = () => {
            list.classList.add("hidden");
            input.setAttribute("aria-expanded", "false");
            input.removeAttribute("aria-activedescendant");
            active = -1;
        };

        const place = () => {
            const box = input.getBoundingClientRect();
            list.style.width = `${box.width}px`;
            list.style.top = `${box.bottom}px`;
            if (document.documentElement.dir === "rtl") {
                list.style.right = `${document.documentElement.clientWidth - box.right}px`;
                list.style.left = "auto";
            } else {
                list.style.left = `${box.left}px`;
                list.style.right = "auto";
            }
        };

        const mark = (index) => {
            active = index;
            options.forEach((option, i) => {
                option.classList.toggle("active", i === index);
                option.setAttribute("aria-selected", String(i === index));
            });
            if (index >= 0) input.setAttribute("aria-activedescendant", options[index].id);
            else input.removeAttribute("aria-activedescendant");
        };

        const pick = (text) => {
            input.value = text;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            close();
        };

        // The suggestions that fit what is typed: the ones that start with it first, then the ones that hold it.
        const fit = (query) => {
            const lower = query.toLowerCase();
            const seen = new Set();
            const starts = [], holds = [];
            for (const text of suggestions()) {
                const key = String(text).toLowerCase();
                if (!key || seen.has(key) || key === lower) continue;
                seen.add(key);
                if (key.startsWith(lower)) starts.push(String(text));
                else if (key.includes(lower)) holds.push(String(text));
            }
            return [...starts, ...holds].slice(0, max);
        };

        const render = () => {
            const query = input.value.trim();
            const texts = query ? fit(query) : [];
            if (!texts.length) return close();
            list.replaceChildren();
            options = texts.map((text, i) => {
                const option = document.createElement("div");
                option.id = `${id}-${i}`;
                option.className = "autocomplete-option";
                option.setAttribute("role", "option");
                const at = text.toLowerCase().indexOf(query.toLowerCase());
                const match = document.createElement("span");
                match.className = "autocomplete-match";
                match.textContent = text.slice(at, at + query.length);
                option.append(text.slice(0, at), match, text.slice(at + query.length));
                option.addEventListener("mousedown", (event) => {
                    event.preventDefault(); // the input keeps the focus
                    pick(text);
                });
                option.addEventListener("mousemove", () => mark(i));
                list.appendChild(option);
                return option;
            });
            place();
            list.classList.remove("hidden");
            input.setAttribute("aria-expanded", "true");
            mark(-1);
        };

        input.addEventListener("input", render);
        input.addEventListener("focus", render);
        input.addEventListener("blur", close);
        input.addEventListener("keydown", (event) => {
            if (list.classList.contains("hidden")) return;
            if (event.key === "ArrowDown") {
                event.preventDefault();
                mark((active + 1) % options.length);
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                mark(active <= 0 ? options.length - 1 : active - 1);
            } else if (event.key === "Enter" && active >= 0) {
                event.preventDefault();
                pick(options[active].textContent);
            } else if (event.key === "Escape") {
                event.stopPropagation();
                close();
            }
        });
        window.addEventListener("resize", () => !list.classList.contains("hidden") && place());
        window.addEventListener("scroll", close, true);
    }

    window.autocomplete = { attach };
})();
