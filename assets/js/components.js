// The small helpers that every app wrote again, made once. They go with the templates of components.css; Kitmu shows each of them.
//   components.element("div", "card", "Text")                  an element with a class and a text
//   components.icon("trash")                                   <span class="icon icon-trash"></span>
//   components.formatSize(1536000)                             "1.5 MB", with the numbers of the language of the page
//   components.extensionOf("Image.PNG")                        "png" (an empty text when there is no dot)
//   const say = components.status(document.getElementById("status"));
//   say("Choose a file.");                                     the hint line of the footer (a notice is a popup: popups.toast)
//   const menu = components.drawer({ sidebar, button });       the sidebar that opens over the main on a narrow screen
//   menu.set(true);                                            opens it (Escape closes it and gives the focus back to the button)
//   components.download("notes.txt", "Hello", "text/plain");   saves a text or a Blob as a file
//   components.expand({ toggle, body, open: false });          a button that opens and closes its body (the expandable part of the template)
//   components.menu({ anchor, items });                         a menu under a button (items: { label, icon, danger, onSelect } or { separator: true });
//                                                               onSelect that gives false keeps it open; { point: { x, y } } instead of anchor is a context menu
//   components.select({ trigger, options, value, onChange });   a button that shows the value and opens a menu of the options
//   components.otp({ length, onComplete });                     one input for each character of a code (its element is .element)
//   components.resizable(container);                            the handle between two panels moves with the pointer and the arrows
//   components.carousel(root);                                  the buttons data-carousel="previous" and "next" move the track
//   components.calendar({ selected, onSelect });                a month of days (its element is .element)
//   components.chart({ type: "bar" or "line", data });          an svg; data is [{ label, value }]
//   components.dataTable({ columns, rows, pageSize, labels });  a table with a filter, a sort on each column, and pages
//   components.scroller(container);                             follow() keeps the end in view only while the reader is at the end
//   components.questionnaire({ items, labels, onSubmit });      questions one after another, with choices
//   <kit-alert kind="error" heading="Failed">The text.</kit-alert>   a component with several parts is one tag: kit-alert, kit-card, kit-item, kit-empty, kit-attachment, kit-message.
//                                                               It builds its parts, so a change of the component reaches every app; the attributes are properties too (element.heading = "...").
//   components.make("alert", { kind: "error", heading: "Failed" }, ["The text."])   the same from a script
//   The parts of the page are tags too: <kit-header theme menu>, <kit-sidebar>, <kit-footer status>; and kit-collapsible, kit-breadcrumbs, kit-tabs, kit-pagination,
//   kit-trace-line, kit-marker, kit-field, kit-search. Their texts that are the same in every app (the account button, the copyright) are in assets/data/kit.json.
//   components.closeOverlay();                                  closes the menu or the popover that is open
//   components.popover({ anchor, content });                    a panel with anything in it, under a button; both close on Escape, on a click outside, on a scroll
(() => {
    const KIT_TEXTS = new URL("../data/kit.json", document.currentScript.src).href;
    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    const icon = (name) => element("span", `icon icon-${name}`);

    const extensionOf = (name) => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");

    function formatSize(bytes) {
        const number = (value) => (window.i18n ? window.i18n.number(value, { maximumFractionDigits: value < 10 ? 1 : 0 }) : value.toFixed(value < 10 ? 1 : 0));
        if (bytes < 1024) return `${bytes} B`;
        const units = ["KB", "MB", "GB", "TB"];
        let value = bytes;
        let index = -1;
        do {
            value /= 1024;
            index++;
        } while (value >= 1024 && index < units.length - 1);
        return `${number(value)} ${units[index]}`;
    }

    // The function that writes in the hint line of the footer: say(text). It is for what the page tells about itself (what to do first, how many items there are);
    // a notice (work that goes on, a result, an error) is a popup, popups.toast in assets/js/popup.js.
    function status(node) {
        return (text) => { node.textContent = text; };
    }

    // The sidebar that is hidden on a narrow screen and opened over the main by the menu button.
    function drawer({ sidebar, button, focus = ".sidebar-item.on, .sidebar-item:not(:disabled)" }) {
        const set = (open) => {
            sidebar.classList.toggle("open", open);
            button.setAttribute("aria-expanded", String(open));
            if (open) sidebar.querySelector(focus)?.focus();
        };
        button.addEventListener("click", () => set(!sidebar.classList.contains("open")));
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && sidebar.classList.contains("open") && button.offsetParent) {
                event.stopImmediatePropagation();
                set(false);
                button.focus();
            }
        });
        return { set };
    }

    function download(name, content, type = "application/octet-stream") {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    }

    // The button opens and closes its body; aria-expanded follows (the template shows it as a green or a red line).
    function expand({ toggle, body, open = true }) {
        const set = (value) => {
            body.hidden = !value;
            toggle.setAttribute("aria-expanded", String(value));
        };
        toggle.addEventListener("click", () => set(body.hidden));
        set(open);
        return { set };
    }

    /* ---------- the menu and the popover: one is open at a time, under the button that opened it ---------- */
    let open = null;

    const closeOpen = () => open?.close();

    // Puts the panel under the anchor (above it when there is no room), or at a point, and inside the window.
    function place(node, { anchor, point, align }) {
        const margin = 8;
        const gap = 6;
        const rtl = getComputedStyle(document.documentElement).direction === "rtl";
        let left;
        let top;
        if (point) {
            left = point.x;
            top = point.y;
        } else {
            const box = anchor.getBoundingClientRect();
            const atEnd = (align === "end") !== rtl;
            left = atEnd ? box.right - node.offsetWidth : box.left;
            top = box.bottom + gap;
            if (top + node.offsetHeight > window.innerHeight - margin) top = box.top - node.offsetHeight - gap;
        }
        node.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - node.offsetWidth - margin))}px`;
        node.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - node.offsetHeight - margin))}px`;
    }

    function show(node, { anchor, point, align = "start" }) {
        // a second click on the same button closes what it opened
        const again = open && anchor && open.anchor === anchor;
        closeOpen();
        if (again) return null;
        (document.getElementById("popups") ?? document.body).appendChild(node);
        place(node, { anchor, point, align });
        const outside = (event) => { if (!node.contains(event.target) && !anchor?.contains(event.target)) close(); };
        const escape = (event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            close(true);
        };
        const scrolled = (event) => { if (!node.contains(event.target)) close(); };   // the page scrolls: it closes; the list inside it scrolls: it stays
        const close = (refocus = false) => {
            if (open?.node !== node) return;
            node.remove();
            document.removeEventListener("pointerdown", outside, true);
            document.removeEventListener("keydown", escape, true);
            window.removeEventListener("resize", close);
            document.removeEventListener("scroll", scrolled, true);
            open = null;
            if (refocus) anchor?.focus();
        };
        open = { node, anchor, close };
        document.addEventListener("pointerdown", outside, true);
        document.addEventListener("keydown", escape, true);
        window.addEventListener("resize", close);
        document.addEventListener("scroll", scrolled, true);
        return { node, close };
    }

    function menu({ anchor, point, items, align, scroll = false }) {
        const node = element("div", "menu");
        node.setAttribute("role", "menu");
        if (scroll) {   // a long list scrolls inside the menu
            node.style.maxHeight = "min(32rem, 60vh)";
            node.style.overflowY = "auto";
        }
        const buttons = [];
        let handle = null;
        for (const entry of items) {
            if (entry.separator) {
                node.appendChild(element("hr", "menu-separator"));
                continue;
            }
            const button = element("button", `menu-item${entry.danger ? " danger" : ""}`);
            button.type = "button";
            button.setAttribute("role", "menuitem");
            button.disabled = !!entry.disabled;
            if (entry.icon) button.appendChild(icon(entry.icon));
            button.appendChild(element("span", "", entry.label));
            button.addEventListener("click", () => {
                const keep = entry.onSelect?.({ button, close: () => handle.close(true) }) === false;
                if (!keep) handle.close(true);
            });
            buttons.push(button);
            node.appendChild(button);
        }
        handle = show(node, { anchor, point, align });
        if (!handle) return null;
        // Keyboard in the menu: arrows move, Home and End go to the ends, Escape closes and gives the focus back, Tab leaves.
        node.addEventListener("keydown", (event) => {
            const enabled = buttons.filter((button) => !button.disabled);
            const index = enabled.indexOf(document.activeElement);
            if (event.key === "ArrowDown") {
                event.preventDefault();
                enabled[(index + 1) % enabled.length].focus();
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                enabled[(index - 1 + enabled.length) % enabled.length].focus();
            } else if (event.key === "Home") {
                event.preventDefault();
                enabled[0].focus();
            } else if (event.key === "End") {
                event.preventDefault();
                enabled[enabled.length - 1].focus();
            } else if (event.key === "Tab") handle.close();
        });
        buttons.find((button) => !button.disabled)?.focus();
        return handle;
    }

    function popover({ anchor, content, align }) {
        const node = element("div", "popover");
        node.tabIndex = -1;
        node.append(content);
        const handle = show(node, { anchor, align });
        if (!handle) return null;
        (node.querySelector("button, input, select, textarea, a[href]") ?? node).focus();
        return handle;
    }

    /* ---------- the select: a button that shows the value and opens a menu of the options ---------- */
    function select({ trigger, options, value, onChange }) {
        const label = element("span");
        trigger.classList.add("select-trigger");
        trigger.replaceChildren(label, icon("chevron-down"));
        let current = value ?? options[0]?.value;
        const refresh = () => {
            label.textContent = options.find((option) => option.value === current)?.label ?? "";
        };
        refresh();
        trigger.addEventListener("click", () => {
            const handle = menu({
                anchor: trigger,
                items: options.map((option) => ({
                    label: option.label,
                    icon: option.value === current ? "check" : "blank",
                    onSelect: () => {
                        current = option.value;
                        refresh();
                        onChange?.(current);
                    },
                })),
            });
            if (handle) handle.node.style.minWidth = `${trigger.offsetWidth}px`;
        });
        return {
            get value() {
                return current;
            },
            set(next) {
                current = next;
                refresh();
            },
        };
    }

    /* ---------- the tag <select>: it opens the menu of the kit, not the list of the browser ---------- */
    // The select keeps its value, its options, and its change event, so an app changes nothing; only the list that opens is the menu of the kit (a second click, Escape, and the arrows work as in every menu).
    // Every <select> of a page gets it (the ones that are made later too); data-native keeps the list of the browser.
    function enhanceSelect(native) {
        if (native.dataset.kitSelect !== undefined || native.hasAttribute("data-native")) return;
        native.dataset.kitSelect = "";
        const choose = () => {
            if (native.disabled) return;
            const handle = menu({
                anchor: native,
                scroll: true,
                items: [...native.options].filter((option) => !option.hidden).map((option) => ({
                    label: option.textContent,
                    icon: option.selected ? "check" : "blank",
                    disabled: option.disabled,
                    onSelect: () => {
                        if (native.value === option.value) return;
                        native.value = option.value;
                        native.dispatchEvent(new Event("input", { bubbles: true }));
                        native.dispatchEvent(new Event("change", { bubbles: true }));
                    },
                })),
            });
            if (!handle) return;
            handle.node.style.minWidth = `${native.offsetWidth}px`;
            const picked = [...handle.node.querySelectorAll(".menu-item")].find((button) => button.querySelector(".icon-check"));
            if (picked) { picked.focus(); picked.scrollIntoView({ block: "nearest" }); }
        };
        native.addEventListener("mousedown", (event) => {
            if (event.button !== 0) return;
            event.preventDefault();   // the list of the browser does not open
            native.focus();
            choose();
        });
        native.addEventListener("keydown", (event) => {
            if (![" ", "Enter", "ArrowDown", "ArrowUp"].includes(event.key)) return;
            event.preventDefault();
            choose();
        });
    }
    // The slider keeps --position (0 to 1) of its knob, for the CSS of assets/css/components.css that paints the track up to it. An app sets the value (and the end) from its code,
    // which does not fire "input": the value of the element is watched, and so are min and max.
    const placeSlider = (input) => {
        const min = Number(input.min || 0);
        const max = Number(input.max || 100);
        input.style.setProperty("--position", max > min ? String(Math.min(1, Math.max(0, (Number(input.value) - min) / (max - min)))) : "0");
    };
    function enhanceSlider(input) {
        if (input.dataset.kitSlider !== undefined) return;
        input.dataset.kitSlider = "";
        const own = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        Object.defineProperty(input, "value", { configurable: true, get() { return own.get.call(this); }, set(next) { own.set.call(this, next); placeSlider(this); } });
        input.addEventListener("input", () => placeSlider(input));
        new MutationObserver(() => placeSlider(input)).observe(input, { attributes: true, attributeFilter: ["min", "max", "value", "step"] });
        placeSlider(input);
    }
    const enhanceSelects = (root) => {
        if (root.matches?.("select")) enhanceSelect(root);
        root.querySelectorAll?.("select").forEach(enhanceSelect);
        if (root.matches?.("input.slider")) enhanceSlider(root);
        root.querySelectorAll?.("input.slider").forEach(enhanceSlider);
    };
    enhanceSelects(document);
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => node.nodeType === 1 && enhanceSelects(node)))).observe(document.documentElement, { childList: true, subtree: true });

    /* ---------- the one time code: one input for each character ---------- */
    function otp({ length = 6, onComplete }) {
        const box = element("div", "otp");
        const inputs = [];
        const value = () => inputs.map((input) => input.value).join("");
        const check = () => {
            if (value().length === length) onComplete?.(value());
        };
        for (let index = 0; index < length; index++) {
            const input = element("input");
            input.type = "text";
            input.inputMode = "numeric";
            input.maxLength = 1;
            input.autocomplete = "one-time-code";
            input.setAttribute("aria-label", String(index + 1));
            input.addEventListener("input", () => {
                input.value = input.value.replace(/\D/g, "").slice(-1);
                if (input.value) inputs[index + 1]?.focus();
                check();
            });
            input.addEventListener("keydown", (event) => {
                if (event.key === "Backspace" && !input.value) inputs[index - 1]?.focus();
            });
            input.addEventListener("paste", (event) => {
                event.preventDefault();
                const digits = (event.clipboardData?.getData("text") ?? "").replace(/\D/g, "").slice(0, length - index);
                [...digits].forEach((digit, offset) => { inputs[index + offset].value = digit; });
                inputs[Math.min(index + digits.length, length - 1)].focus();
                check();
            });
            inputs.push(input);
            box.appendChild(input);
        }
        return {
            element: box,
            get value() {
                return value();
            },
            clear() {
                inputs.forEach((input) => { input.value = ""; });
                inputs[0].focus();
            },
        };
    }

    /* ---------- resizable panels: the handle moves with the pointer and with the arrows ---------- */
    function resizable(container) {
        const handle = container.querySelector(".resizable-handle");
        const first = handle.previousElementSibling;
        const vertical = container.classList.contains("vertical");
        handle.tabIndex = 0;
        handle.setAttribute("role", "separator");
        handle.setAttribute("aria-orientation", vertical ? "horizontal" : "vertical");
        const set = (pixels) => {
            const total = (vertical ? container.clientHeight : container.clientWidth) - (vertical ? handle.offsetHeight : handle.offsetWidth);
            const size = Math.max(total * 0.1, Math.min(pixels, total * 0.9));
            first.style.flex = `none`;
            first.style[vertical ? "height" : "width"] = `${size}px`;
        };
        handle.addEventListener("pointerdown", (event) => {
            handle.setPointerCapture(event.pointerId);
            const move = (moveEvent) => {
                const box = container.getBoundingClientRect();
                const rtl = getComputedStyle(container).direction === "rtl";
                set(vertical ? moveEvent.clientY - box.top : rtl ? box.right - moveEvent.clientX : moveEvent.clientX - box.left);
            };
            const stop = () => {
                handle.removeEventListener("pointermove", move);
                handle.removeEventListener("pointerup", stop);
            };
            handle.addEventListener("pointermove", move);
            handle.addEventListener("pointerup", stop);
        });
        handle.addEventListener("keydown", (event) => {
            const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 16 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -16 : 0;
            if (!step) return;
            event.preventDefault();
            const rtl = getComputedStyle(container).direction === "rtl" && !vertical;
            set((vertical ? first.offsetHeight : first.offsetWidth) + (rtl ? -step : step));
        });
        return { set };
    }

    /* ---------- the carousel: the buttons move the track by one width ---------- */
    function carousel(root) {
        const track = root.querySelector(".carousel-track");
        const sign = getComputedStyle(root).direction === "rtl" ? -1 : 1;
        const go = (direction) => track.scrollBy({ left: direction * sign * track.clientWidth, behavior: "smooth" });
        root.querySelector('[data-carousel="previous"]').addEventListener("click", () => go(-1));
        root.querySelector('[data-carousel="next"]').addEventListener("click", () => go(1));
    }

    /* ---------- the calendar: a month, in the language of the page; a day is picked with a click ---------- */
    function calendar({ value = new Date(), selected = null, onSelect }) {
        const language = window.i18n?.lang ?? navigator.language;
        let view = new Date(value.getFullYear(), value.getMonth(), 1);
        let picked = selected;
        const locale = new Intl.Locale(language);
        const firstDay = ((locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay ?? 7) % 7;   // 0 is Sunday
        const number = new Intl.NumberFormat(language);
        const box = element("div", "calendar");
        const header = element("div", "calendar-header");
        const previous = element("button", "square");
        const title = element("span", "calendar-title");
        const next = element("button", "square");
        previous.type = next.type = "button";
        previous.append(icon("chevron-left"));
        next.append(icon("chevron-right"));
        previous.setAttribute("aria-label", "-");
        next.setAttribute("aria-label", "+");
        header.append(previous, title, next);
        const grid = element("div", "calendar-grid");
        box.append(header, grid);
        const same = (a, b) => a && b && a.toDateString() === b.toDateString();
        const draw = () => {
            title.textContent = new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(view);
            grid.replaceChildren();
            const names = new Intl.DateTimeFormat(language, { weekday: "short" });
            for (let day = 0; day < 7; day++) grid.append(element("span", "calendar-weekday", names.format(new Date(2024, 0, 7 + ((firstDay + day) % 7)))));
            const start = new Date(view.getFullYear(), view.getMonth(), 1 - ((view.getDay() - firstDay + 7) % 7));
            for (let index = 0; index < 42; index++) {
                const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
                const button = element("button", "calendar-day", number.format(date.getDate()));
                button.type = "button";
                button.classList.toggle("outside", date.getMonth() !== view.getMonth());
                button.classList.toggle("today", same(date, new Date()));
                button.classList.toggle("on", same(date, picked));
                button.addEventListener("click", () => {
                    picked = date;
                    if (date.getMonth() !== view.getMonth()) view = new Date(date.getFullYear(), date.getMonth(), 1);
                    draw();
                    onSelect?.(date);
                });
                grid.append(button);
            }
        };
        previous.addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); draw(); });
        next.addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); draw(); });
        draw();
        return {
            element: box,
            get value() {
                return picked;
            },
        };
    }

    /* ---------- the chart: bars or a line, in svg ---------- */
    function chart({ type = "bar", data, width = 320, height = 160 }) {
        const namespace = "http://www.w3.org/2000/svg";
        const make = (tag, attributes, className) => {
            const node = document.createElementNS(namespace, tag);
            for (const [name, text] of Object.entries(attributes)) node.setAttribute(name, text);
            if (className) node.setAttribute("class", className);
            return node;
        };
        const svg = make("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" }, "chart");
        const left = 8;
        const bottom = 22;
        const top = 8;
        const plotWidth = width - left * 2;
        const plotHeight = height - top - bottom;
        const maximum = Math.max(...data.map((point) => point.value), 1);
        const slot = plotWidth / data.length;
        svg.append(make("line", { x1: left, y1: top + plotHeight, x2: width - left, y2: top + plotHeight }, "chart-axis"));
        const points = data.map((point, index) => {
            const x = left + slot * index + slot / 2;
            const y = top + plotHeight - (point.value / maximum) * plotHeight;
            const label = make("text", { x, y: height - 6 }, "chart-label");
            label.textContent = point.label;
            svg.append(label);
            if (type === "bar") svg.append(make("rect", { x: x - slot * 0.3, y, width: slot * 0.6, height: top + plotHeight - y, rx: 2 }, "chart-bar"));
            return [x, y];
        });
        if (type === "line") {
            svg.append(make("polyline", { points: points.map((point) => point.join(",")).join(" ") }, "chart-line"));
            points.forEach(([x, y]) => svg.append(make("circle", { cx: x, cy: y, r: 3 }, "chart-dot")));
        }
        return svg;
    }

    /* ---------- the data table: a filter, a sort on each column, and pages ---------- */
    function dataTable({ columns, rows, pageSize = 5, labels = {} }) {
        const text = { filter: "Filter...", previous: "Previous", next: "Next", empty: "No results.", ...labels };
        const state = { query: "", key: null, direction: "ascending", page: 0 };
        const box = element("div", "data-table");
        const search = element("label", "searchbox");
        const input = element("input");
        input.type = "search";
        input.placeholder = text.filter;
        input.setAttribute("aria-label", text.filter);
        search.append(icon("search"), input);
        const table = element("table", "table");
        const footer = element("div", "data-table-footer");
        const count = element("span");
        const pages = element("div", "pagination");
        const previous = element("button", "", text.previous);
        const following = element("button", "", text.next);
        previous.type = following.type = "button";
        pages.append(previous, following);
        footer.append(count, pages);
        const scroll = element("div", "scroll-area");   // a table that is wider than the screen scrolls inside its own box
        scroll.append(table);
        box.append(search, scroll, footer);
        const draw = () => {
            const query = state.query.toLowerCase();
            let shown = rows.filter((row) => columns.some((column) => String(row[column.key]).toLowerCase().includes(query)));
            if (state.key) {
                const sign = state.direction === "ascending" ? 1 : -1;
                shown = [...shown].sort((a, b) => sign * String(a[state.key]).localeCompare(String(b[state.key]), undefined, { numeric: true }));
            }
            const last = Math.max(0, Math.ceil(shown.length / pageSize) - 1);
            state.page = Math.min(state.page, last);
            const head = element("thead");
            const headRow = element("tr");
            for (const column of columns) {
                const cell = element("th");
                const sort = element("button", "table-sort");
                sort.type = "button";
                sort.append(element("span", "", column.label), icon("arrow-down"));
                if (state.key === column.key) sort.dataset.sort = state.direction;
                cell.setAttribute("aria-sort", state.key === column.key ? state.direction : "none");
                sort.addEventListener("click", () => {
                    state.direction = state.key === column.key && state.direction === "ascending" ? "descending" : "ascending";
                    state.key = column.key;
                    draw();
                });
                cell.append(sort);
                headRow.append(cell);
            }
            head.append(headRow);
            const body = element("tbody");
            const page = shown.slice(state.page * pageSize, state.page * pageSize + pageSize);
            if (!page.length) {
                const cell = element("td", "", text.empty);
                cell.colSpan = columns.length;
                const empty = element("tr");
                empty.append(cell);
                body.append(empty);
            }
            for (const row of page) {
                const line = element("tr");
                for (const column of columns) line.append(element("td", "", String(row[column.key])));
                body.append(line);
            }
            table.replaceChildren(head, body);
            count.textContent = `${shown.length ? state.page * pageSize + 1 : 0}–${state.page * pageSize + page.length} / ${shown.length}`;
            previous.disabled = state.page === 0;
            following.disabled = state.page >= last;
        };
        input.addEventListener("input", () => { state.query = input.value; state.page = 0; draw(); });
        previous.addEventListener("click", () => { state.page--; draw(); });
        following.addEventListener("click", () => { state.page++; draw(); });
        draw();
        return { element: box };
    }

    /* ---------- the message scroller: follows a stream only while the reader is at the end ---------- */
    function scroller(container) {
        let following = true;
        const atEnd = () => container.scrollHeight - container.scrollTop - container.clientHeight < 8;
        container.addEventListener("scroll", () => { following = atEnd(); });
        return {
            follow() {
                if (following) container.scrollTop = container.scrollHeight;
            },
            toEnd() {
                following = true;
                container.scrollTop = container.scrollHeight;
            },
            get following() {
                return following;
            },
        };
    }

    /* ---------- the questionnaire: questions one after another, with choices ---------- */
    function questionnaire({ items, labels = {}, onSubmit }) {
        const text = { previous: "Previous", next: "Next", skip: "Skip", submit: "Submit", required: "Choose an answer.", other: "Another answer", progress: "Question {n} of {total}", ...labels };
        const answers = {};
        let index = 0;
        const box = element("div", "questionnaire");
        const draw = () => {
            const item = items[index];
            const progress = element("span", "questionnaire-progress", text.progress.replace("{n}", index + 1).replace("{total}", items.length));
            const title = element("span", "questionnaire-title", item.prompt);
            const description = element("span", "questionnaire-description", item.description ?? "");
            const list = element("div", "choices");
            const error = element("span", "error");
            const choose = (value) => {
                if (item.multiple) {
                    const chosen = new Set(answers[item.name] ?? []);
                    chosen.has(value) ? chosen.delete(value) : chosen.add(value);
                    answers[item.name] = [...chosen];
                } else answers[item.name] = value;
                draw();
            };
            item.choices.forEach((choice, position) => {
                const button = element("button", "choice");
                button.type = "button";
                const wording = element("span", "choice-text", choice.label);
                if (choice.description) wording.append(element("span", "choice-description", choice.description));
                button.append(element("span", "choice-key", String.fromCharCode(65 + position)), wording);
                const answer = answers[item.name];
                button.classList.toggle("on", item.multiple ? (answer ?? []).includes(choice.value) : answer === choice.value);
                button.addEventListener("click", () => choose(choice.value));
                list.append(button);
            });
            const parts = [progress, title, description, list];
            if (item.input) {
                const field = element("input");
                field.type = "text";
                field.placeholder = item.input.placeholder ?? text.other;
                field.setAttribute("aria-label", item.input.label ?? text.other);
                field.value = item.choices.some((choice) => choice.value === answers[item.name]) ? "" : (answers[item.name] ?? "");
                field.addEventListener("input", () => { answers[item.name] = field.value; });
                parts.push(field);
            }
            const actions = element("div", "questionnaire-actions");
            const last = index === items.length - 1;
            const previous = element("button", "ghost", text.previous);
            previous.type = "button";
            previous.disabled = index === 0;
            previous.addEventListener("click", () => { index--; draw(); });
            const skip = element("button", "ghost", text.skip);
            skip.type = "button";
            skip.addEventListener("click", () => { delete answers[item.name]; if (last) onSubmit?.(answers); else { index++; draw(); } });
            const forward = element("button", "primary", last ? text.submit : text.next);
            forward.type = "button";
            forward.addEventListener("click", () => {
                const answer = answers[item.name];
                if (item.required && (answer === undefined || answer === "" || (Array.isArray(answer) && !answer.length))) {
                    error.textContent = text.required;
                    return;
                }
                if (last) onSubmit?.(answers);
                else { index++; draw(); }
            });
            actions.append(previous);
            if (!item.required) actions.append(skip);
            actions.append(forward);
            parts.push(error, actions);
            box.replaceChildren(...parts);
        };
        draw();
        return { element: box, answers };
    }

    /* ---------- the elements kit-*: one tag builds a component that has several parts, so a change of the component reaches every app ---------- */
    const KIND_ICON = { success: "check", info: "info", warning: "warning", error: "alert" };

    // The texts of the parts that the page parts have on their own (the account button, the copyright): assets/data/kit.json, in every language.
    let kitTexts = null;
    const kitText = (key) => (kitTexts?.[key] ? (window.i18n?.lang ? window.i18n.pick(kitTexts[key]) : kitTexts[key]["en-US"]) : "");
    const withTexts = new Set();   // the tags that show a text of kit.json: they are made again when the language changes
    let refreshing = false;
    function refreshTexts() {
        refreshing = true;
        for (const host of withTexts) host.render();
        refreshing = false;
    }
    fetch(KIT_TEXTS).then((response) => response.json()).then((texts) => { kitTexts = texts; refreshTexts(); }).catch(() => {});

    // The tag keeps what is written inside it (the content, and the nodes with a slot attribute), and builds the parts around it.
    // The attributes of the tag are also properties: element.heading = "Title" sets the attribute, and the parts follow.
    // An attribute can be translated like a text: data-i18n-heading="key" gives heading the text of the key in the language of the page.
    // live: the children are looked at again each time they change (the tag keeps the ones that this function says yes to); texts: the tag shows a text of kit.json.
    function defineElement(name, attributes, build, { live = null, texts = false } = {}) {
        class Kit extends HTMLElement {
            static get observedAttributes() {
                return attributes;
            }

            connectedCallback() {
                if (!this.rendered) this.render();
                if (texts) withTexts.add(this);
            }

            disconnectedCallback() {
                withTexts.delete(this);
            }

            attributeChangedCallback() {
                if (this.rendered && !this.updating) this.render();
            }

            render() {
                this.updating = true;
                this.observer?.disconnect();
                for (const attribute of attributes) {
                    const key = this.getAttribute(`data-i18n-${attribute}`);
                    if (key !== null && window.i18n?.data) this.setAttribute(attribute, window.i18n.t(key));
                }
                if (live) this.original = [...this.childNodes].filter(live);
                else if (!this.rendered) this.original = [...this.childNodes];
                this.rendered = true;
                const slots = {};
                const content = [];
                for (const node of this.original) {
                    const slot = node.nodeType === 1 ? node.getAttribute("slot") : null;
                    if (slot) (slots[slot] ??= []).push(node);
                    else content.push(node);
                }
                const classes = build(this, { content, slots, refresh: refreshing }).filter(Boolean);
                this.classList.remove(...(this.managed ?? []));
                this.classList.add(...classes);
                this.managed = classes;
                if (!refreshing && window.i18n?.data) window.i18n.apply(this);
                if (live && this.isConnected) {
                    this.observer ??= new MutationObserver(() => { if (!this.updating) this.render(); });
                    this.observer.observe(this, { childList: true });
                }
                this.updating = false;
            }
        }
        for (const attribute of attributes) {
            Object.defineProperty(Kit.prototype, attribute, {
                get() {
                    return this.getAttribute(attribute) ?? "";
                },
                set(value) {
                    if (value === false || value == null) this.removeAttribute(attribute);
                    else this.setAttribute(attribute, value === true ? "" : value);
                },
            });
        }
        customElements.define(`kit-${name}`, Kit);
    }

    const hasContent = (nodes) => nodes.some((node) => node.nodeType === 1 || node.textContent.trim());
    const attributeOf = (host, name) => host.getAttribute(name) ?? "";
    let counter = 0;

    defineElement("alert", ["kind", "heading"], (host, { content }) => {
        const kind = host.getAttribute("kind") || "info";
        host.setAttribute("role", "alert");
        const body = element("div", "alert-body");
        if (host.getAttribute("heading")) body.append(element("span", "alert-title", host.getAttribute("heading")));
        const text = element("span", "alert-text");
        text.append(...content);
        body.append(text);
        host.replaceChildren(icon(KIND_ICON[kind] ?? "info"), body);
        return ["alert", kind];
    });

    defineElement("card", ["heading", "description"], (host, { content, slots }) => {
        const parts = [];
        if (host.getAttribute("heading") || host.getAttribute("description")) {
            const header = element("div", "card-header");
            if (host.getAttribute("heading")) header.append(element("span", "card-title", host.getAttribute("heading")));
            if (host.getAttribute("description")) header.append(element("span", "card-description", host.getAttribute("description")));
            parts.push(header);
        }
        if (hasContent(content)) {
            const body = element("div", "card-content");
            body.append(...content);
            parts.push(body);
        }
        if (slots.footer) {
            const footer = element("div", "card-footer");
            footer.append(...slots.footer);
            parts.push(footer);
        }
        host.replaceChildren(...parts);
        return ["card"];
    });

    defineElement("item", ["heading", "description"], (host, { content, slots }) => {
        const body = element("div", "item-body");
        if (host.getAttribute("heading")) body.append(element("span", "item-title", host.getAttribute("heading")));
        if (host.getAttribute("description")) body.append(element("span", "item-description", host.getAttribute("description")));
        if (hasContent(content)) body.append(...content);
        host.replaceChildren(...(slots.media ?? []), body, ...(slots.actions ?? []));
        return ["item"];
    });

    defineElement("empty", ["icon", "heading", "text"], (host, { content, slots }) => {
        const illustration = element("div", "empty-illustration");
        illustration.append(icon(host.getAttribute("icon") || "folder"));
        const text = element("span", "empty-text", host.getAttribute("text") ?? "");
        if (!text.textContent && hasContent(content)) text.append(...content);
        host.replaceChildren(illustration, element("span", "empty-title", host.getAttribute("heading") ?? ""), text, ...(slots.action ?? []));
        return ["empty-state"];
    });

    defineElement("attachment", ["name", "detail", "icon", "image", "kind"], (host, { slots }) => {
        const media = element("span", "attachment-media");
        if (host.getAttribute("image")) media.style.backgroundImage = `url("${host.getAttribute("image")}")`;
        else media.append(icon(host.getAttribute("icon") || "file"));
        const body = element("div", "attachment-content");
        body.append(element("span", "attachment-title", host.getAttribute("name") ?? ""), element("span", "attachment-description", host.getAttribute("detail") ?? ""));
        const parts = [media, body];
        if (slots.actions) {
            const actions = element("div", "attachment-actions");
            actions.append(...slots.actions);
            parts.push(actions);
        }
        host.replaceChildren(...parts);
        return ["attachment", host.getAttribute("kind") === "error" ? "error" : null];
    });

    defineElement("message", ["end", "heading", "footer", "avatar", "bubble"], (host, { content, slots }) => {
        const parts = [];
        if (host.hasAttribute("avatar")) {
            const avatar = element("span", "message-avatar");
            avatar.append(element("span", "avatar", host.getAttribute("avatar")));
            parts.push(avatar);
        }
        const column = element("div", "message-content");
        if (host.getAttribute("heading")) column.append(element("div", "message-header", host.getAttribute("heading")));
        const bubble = element("div", `bubble${host.getAttribute("bubble") ? ` ${host.getAttribute("bubble")}` : ""}`);
        bubble.append(...content);
        column.append(bubble);
        if (slots.footer) {
            for (const node of slots.footer) {
                node.classList.add("message-footer");
                column.append(node);
            }
        } else if (host.getAttribute("footer")) column.append(element("div", "message-footer", host.getAttribute("footer")));
        host.parts = { bubble };
        host.replaceChildren(...parts, column);
        return ["message", host.hasAttribute("end") ? "end" : null];
    });

    /* the parts of the page: the header, the sidebar, and the footer */
    defineElement("header", ["theme", "menu", "menu-label", "menu-text", "no-account", "name"], (host, { refresh }) => {
        // a new language only changes the texts: the buttons stay, because the app has tied its scripts to them
        if (refresh && host.querySelector(".header-tools")) {
            const names = { "theme-button": "theme", "account-button": "account", "menu-button": "menu" };
            for (const button of host.querySelectorAll(".header-tools button")) {
                const label = button.id === "menu-button" ? host.getAttribute("menu-label") || kitText("menu") : kitText(names[button.id]);
                button.setAttribute("aria-label", label);
                if (button.querySelector("span:not(.icon)")) button.querySelector("span:not(.icon)").textContent = label;
                else button.title = label;
            }
            return host.managed;
        }
        const logo = element("div", "logo");
        const name = element("span", "logo-name");
        if (host.getAttribute("name")) name.innerHTML = host.getAttribute("name");
        else name.setAttribute("data-i18n-html", "logo");
        logo.append(element("div", "logo-mark"), name);
        const tools = element("div", "header-tools");
        const tool = (id, className, iconName, label) => {
            const button = element("button", className);
            button.id = id;
            button.type = "button";
            button.append(icon(iconName));
            button.title = label;
            button.setAttribute("aria-label", label);
            return button;
        };
        if (host.hasAttribute("theme")) tools.append(tool("theme-button", "square", "sun", kitText("theme")));
        if (!host.hasAttribute("no-account")) tools.append(tool("account-button", "ghost square account", "user", kitText("account")));
        if (host.hasAttribute("menu")) {
            const label = host.getAttribute("menu-label") || kitText("menu");
            const withText = host.hasAttribute("menu-text");
            const button = tool("menu-button", withText ? "menu-button" : "ghost square menu-button", "menu", label);
            button.setAttribute("aria-controls", "sidebar");
            button.setAttribute("aria-expanded", "false");
            if (withText) {
                button.removeAttribute("title");
                button.append(element("span", "", label));
            }
            tools.append(button);
        }
        host.id ||= "header";
        host.replaceChildren(logo, tools);
        return ["header"];
    }, { texts: true });

    defineElement("sidebar", ["tablist", "label"], (host, { content, slots }) => {
        const kept = host.querySelector(":scope > #sidebar-nav");   // the app writes in the list: it stays the same element
        const nav = kept ?? element("div", "sidebar-nav");
        nav.id = "sidebar-nav";
        if (host.hasAttribute("tablist")) nav.setAttribute("role", "tablist");
        if (host.getAttribute("label")) nav.setAttribute("aria-label", host.getAttribute("label"));
        if (!kept) nav.append(...content);
        host.id ||= "sidebar";
        host.replaceChildren(...(slots.before ?? []), nav, ...(slots.after ?? []));
        return ["sidebar"];
    });

    defineElement("footer", ["status", "brand"], (host, { refresh }) => {
        const copyright = kitText("copyright").replace("{brand}", host.getAttribute("brand") ?? window.i18n?.brand?.name ?? "");
        if (refresh && host.querySelector(".copyright")) {
            host.querySelector(".copyright").textContent = copyright;
            return host.managed;
        }
        const parts = [];
        if (host.hasAttribute("status")) {
            const status = element("span");
            status.id = "status";
            parts.push(status);
        }
        const link = element("a", "copyright", copyright);
        link.href = "/";
        link.target = "_top";
        parts.push(link);
        host.id ||= "footer";
        // the status line is written by the app: keep what it wrote
        const old = host.querySelector("#status");
        if (old && parts[0]?.id === "status") parts[0] = old;
        host.replaceChildren(...parts);
        return ["footer"];
    }, { texts: true });

    /* the parts that open, the path, the tabs, the pages, the steps, and the notes */
    defineElement("collapsible", ["heading", "open"], (host, { content }) => {
        const toggle = element("button", "section-toggle");
        toggle.type = "button";
        toggle.append(element("span", "", host.getAttribute("heading") ?? ""), icon("chevron-down"));
        const body = element("div", "section-body");
        body.append(...content);
        expand({ toggle, body, open: host.hasAttribute("open") });
        // the attribute follows what the user does, without making the parts again
        toggle.addEventListener("click", () => {
            host.updating = true;
            host.toggleAttribute("open", !body.hidden);
            host.updating = false;
        });
        host.replaceChildren(toggle, body);
        host.parts = { toggle, body };
        return ["collapsible"];
    });

    defineElement("breadcrumbs", [], (host, { content }) => {
        const parts = [];
        content.filter((node) => node.nodeType === 1).forEach((node, index) => {
            node.classList.add("breadcrumb");
            if (index) {
                const separator = icon("chevron-right");
                separator.classList.add("breadcrumb-separator");
                parts.push(separator);
            }
            parts.push(node);
        });
        host.replaceChildren(...parts);
        return ["breadcrumbs"];
    }, { live: (node) => !(node.nodeType === 1 && node.classList.contains("breadcrumb-separator")) });

    defineElement("tabs", ["value"], (host, { content }) => {
        host.setAttribute("role", "tablist");
        const buttons = content.filter((node) => node.nodeType === 1);
        for (const button of buttons) {
            const on = (button.getAttribute("value") ?? button.textContent.trim()) === host.getAttribute("value");
            button.setAttribute("role", "tab");
            button.setAttribute("aria-selected", String(on));
            button.classList.toggle("on", on);
            button.onclick = () => {
                host.value = button.getAttribute("value") ?? button.textContent.trim();
                host.dispatchEvent(new CustomEvent("change", { detail: { value: host.value } }));
            };
        }
        host.replaceChildren(...buttons);
        return ["tabs"];
    });

    defineElement("pagination", ["pages", "page"], (host) => {
        const pages = Math.max(1, Number(host.getAttribute("pages")) || 1);
        const page = Math.min(pages, Math.max(1, Number(host.getAttribute("page")) || 1));
        const go = (value) => {
            host.page = value;
            host.dispatchEvent(new CustomEvent("change", { detail: { page: value } }));
        };
        const button = (label, value, on = false, disabled = false) => {
            const node = element("button", on ? "on" : "", label);
            node.type = "button";
            node.disabled = disabled;
            node.addEventListener("click", () => go(value));
            return node;
        };
        const numbers = [];
        for (let number = 1; number <= pages; number++) if (pages <= 7 || number === 1 || number === pages || Math.abs(number - page) <= 1) numbers.push(number);
        const parts = [button(kitText("previous"), page - 1, false, page === 1)];
        numbers.forEach((number, index) => {
            if (index && number - numbers[index - 1] > 1) parts.push(element("span", "", "…"));
            parts.push(button(String(number), number, number === page));
        });
        parts.push(button(kitText("next"), page + 1, false, page === pages));
        host.replaceChildren(...parts);
        return ["pagination"];
    }, { texts: true });

    defineElement("trace-line", ["icon", "heading", "description", "status"], (host, { content }) => {
        const status = host.getAttribute("status") ?? "";
        const detail = hasContent(content);
        const line = element(detail ? "button" : "div", `trace-line${status ? ` ${status}` : ""}`);
        if (detail) line.type = "button";
        line.append(icon(host.getAttribute("icon") || "file"), element("span", "trace-title", host.getAttribute("heading") ?? ""));
        if (host.getAttribute("description")) line.append(element("span", "trace-description", host.getAttribute("description")));
        const parts = [line];
        if (detail) {
            line.append(icon("chevron-down"));
            const body = element("div", "trace-detail");
            body.append(...content);
            expand({ toggle: line, body, open: false });
            parts.push(body);
        }
        host.replaceChildren(...parts);
        return ["trace-item"];
    });

    defineElement("marker", ["variant", "icon", "status", "shimmer"], (host, { content }) => {
        const variant = host.getAttribute("variant") ?? "";
        const text = element("span", host.hasAttribute("shimmer") ? "shimmer" : "");
        text.append(...content);
        const parts = [];
        if (host.hasAttribute("status")) {
            host.setAttribute("role", "status");
            parts.push(element("span", "spinner"));
        } else if (host.getAttribute("icon")) parts.push(icon(host.getAttribute("icon")));
        parts.push(text);
        host.replaceChildren(...parts);
        return ["marker", variant];
    });

    /* the form: a field with its label and hint, and the search box */
    defineElement("field", ["label", "hint"], (host, { content }) => {
        const control = content.find((node) => node.nodeType === 1 && /^(input|select|textarea|button)$/i.test(node.tagName)) ?? content.find((node) => node.nodeType === 1);
        const parts = [];
        if (host.getAttribute("label")) {
            const label = element("label", "field-label", host.getAttribute("label"));
            if (control) {
                control.id ||= `field-${++counter}`;
                label.htmlFor = control.id;
            }
            parts.push(label);
        }
        parts.push(...content);
        if (host.getAttribute("hint")) parts.push(element("span", "field-hint", host.getAttribute("hint")));
        host.replaceChildren(...parts);
        return ["field"];
    });

    defineElement("search", ["input-id", "placeholder", "aria-label"], (host) => {
        const input = host.querySelector("input") ?? element("input");
        input.type = "search";
        if (host.getAttribute("input-id")) input.id = host.getAttribute("input-id");
        input.placeholder = host.getAttribute("placeholder") ?? "";
        const label = host.getAttribute("aria-label");
        if (label) input.setAttribute("aria-label", label);
        host.replaceChildren(icon("search"), input);
        return ["searchbox"];
    });

    // The same component from a script: components.make("alert", { kind: "error", heading: "Failed" }, ["The text."]).
    function make(name, attributes = {}, children = []) {
        const host = document.createElement(`kit-${name}`);
        for (const [key, value] of Object.entries(attributes)) if (value !== false && value != null) host.setAttribute(key, value === true ? "" : value);
        host.append(...children);
        host.render();
        return host;
    }

    window.components = { element, icon, extensionOf, formatSize, status, drawer, download, expand, menu, popover, closeOverlay: closeOpen, select, otp, resizable, carousel, calendar, chart, dataTable, scroller, questionnaire, make, refreshTexts };
})();
