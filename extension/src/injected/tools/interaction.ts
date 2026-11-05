/** Runs in the page for clickElement. */
export function clickElementInPage(sel: string, idx: number, wait: number, quietMs: number, format: string) {
    return new Promise<any>((resolve) => {
        const els = document.querySelectorAll(sel);
        if (els.length === 0) {
            const suggestions: string[] = [];
            const classMatch = sel.match(/\.([a-zA-Z0-9_-]+)/);
            if (classMatch) {
                const similar = document.querySelectorAll('[class*="' + classMatch[1] + '"]');
                if (similar.length > 0) suggestions.push("Similar classes: " + Array.from(similar).slice(0, 5).map(e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + Array.from(e.classList).join(".")).join(", "));
            }
            const tagMatch = sel.match(/^([a-z]+)/i);
            if (tagMatch) {
                const count = document.querySelectorAll(tagMatch[1]).length;
                if (count > 0) suggestions.push(count + " <" + tagMatch[1] + "> elements exist on the page");
            }
            resolve({
                error: `No elements found for selector: ${sel}`, ...(suggestions.length > 0 && {suggestions}),
                hint: "Call getPageStructure to inspect the DOM and find valid selectors."
            });
            return;
        }
        if (idx >= els.length) {
            resolve({
                error: `Index ${idx} out of range — only ${els.length} element(s) matched "${sel}"`,
            });
            return;
        }

        const el = els[idx] as HTMLElement;
        // el.click() needs no on-screen point; scroll only so the user sees what was clicked.
        const box = el.getBoundingClientRect();
        if (box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) el.scrollIntoView({behavior: "instant", block: "center"});
        try {(window as any).__tamperSlothGuidance?.cue(el,'click');} catch { /* Decoration is optional. */ }

        // Wait for the click's effects: until the page has changed and gone quiet, or `wait` at most.
        let last = 0;
        const observer = new MutationObserver(() => { last = performance.now(); });
        observer.observe(document, {subtree: true, childList: true, attributes: true, characterData: true});
        el.click();
        const start = performance.now();
        const check = () => {
            const now = performance.now();
            if (!(last && now - last >= quietMs && now - start >= 50) && now - start < wait) { setTimeout(check, 25); return; }
            observer.disconnect();
            if (format === "concise") {
                resolve({clicked: true});
            } else {
                resolve({
                    clicked: true,
                    tag: el.tagName.toLowerCase(),
                    id: el.id || undefined,
                    classes: Array.from(el.classList),
                    text: el.textContent?.trim().slice(0, 200),
                    href: (el as HTMLAnchorElement).href || undefined,
                    matchCount: els.length,
                    indexClicked: idx,
                    settledMs: Math.round(now - start),
                });
            }
        };
        check();
    });
}

/** Runs in the page for typeText. */
export function typeTextInPage(
    sel: string,
    value: string,
    clear: boolean,
    enter: boolean,
    idx: number,
    format: string
) {
    const els = document.querySelectorAll(sel);
    if (els.length === 0) {
        const suggestions: string[] = [];
        const classMatch = sel.match(/\.([a-zA-Z0-9_-]+)/);
        if (classMatch) {
            const similar = document.querySelectorAll('[class*="' + classMatch[1] + '"]');
            if (similar.length > 0) suggestions.push("Similar classes: " + Array.from(similar).slice(0, 5).map(e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + Array.from(e.classList).join(".")).join(", "));
        }
        const tagMatch = sel.match(/^([a-z]+)/i);
        if (tagMatch) {
            const count = document.querySelectorAll(tagMatch[1]).length;
            if (count > 0) suggestions.push(count + " <" + tagMatch[1] + "> elements exist on the page");
        }
        return {
            error: `No elements found for selector: ${sel}`, ...(suggestions.length > 0 && {suggestions}),
            hint: "Call getPageStructure to inspect the DOM and find valid selectors."
        };
    }
    if (idx >= els.length) {
        return {
            error: `Index ${idx} out of range — only ${els.length} element(s) matched "${sel}"`,
        };
    }

    const el = els[idx] as HTMLElement;
    const box = el.getBoundingClientRect();
    if (box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) el.scrollIntoView({behavior: "instant", block: "center"});
    el.focus();
    // Fields that offer suggestions as you type, worth waiting for after typing.
    const suggests = el.getAttribute("role") === "combobox" || el.hasAttribute("aria-autocomplete") || el.hasAttribute("list")
        || (el as HTMLInputElement).type === "search";

    try {(window as any).__tamperSlothGuidance?.cue(el,'type');} catch { /* Decoration is optional. */ }

    const isInput =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement;
    const isContentEditable = el.isContentEditable;

    if (!isInput && !isContentEditable) {
        return {
            error: `Element <${el.tagName.toLowerCase()}> is not an input, textarea, or contenteditable`,
        };
    }

    if (isInput) {
        const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
        if (clear) inputEl.value = "";
        inputEl.value += value;

        // Trigger framework-compatible events
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            el instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype,
            "value"
        )?.set;
        nativeInputValueSetter?.call(el, inputEl.value);

        el.dispatchEvent(new Event("input", {bubbles: true}));
        el.dispatchEvent(new Event("change", {bubbles: true}));
    } else {
        // contenteditable
        if (clear) el.textContent = "";
        el.textContent += value;
        el.dispatchEvent(new Event("input", {bubbles: true}));
    }

    if (enter) {
        el.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                bubbles: true,
            })
        );
        el.dispatchEvent(
            new KeyboardEvent("keypress", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                bubbles: true,
            })
        );
        el.dispatchEvent(
            new KeyboardEvent("keyup", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                bubbles: true,
            })
        );

        // Also try submitting the parent form
        const form = el.closest("form");
        if (form) {
            form.dispatchEvent(
                new SubmitEvent("submit", {
                    bubbles: true,
                    cancelable: true,
                })
            );
        }
    }

    if (format === "concise") {
        return {typed: true, pressedEnter: enter, ...(suggests ? {suggests} : {})};
    }
    return {
        typed: true,
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        name: (el as HTMLInputElement).name || undefined,
        finalValue: isInput
            ? (el as HTMLInputElement).value.slice(0, 500)
            : el.textContent?.slice(0, 500),
        pressedEnter: enter,
        ...(suggests ? {suggests} : {}),
    };
}

/** Runs in the page for selectOption. */
export function selectOptionInPage(
    sel: string,
    val: string | null,
    lbl: string | null,
    idx: number | null,
    format: string
) {
    const selectEl = document.querySelector(sel) as HTMLSelectElement;
    if (!selectEl) {
        const selectCount = document.querySelectorAll("select").length;
        return {error: `No element found for selector: ${sel}`, ...(selectCount > 0 && {hint: selectCount + " <select> elements exist. Call getPageStructure to find the right selector."})};
    }
    if (selectEl.tagName.toLowerCase() !== "select") {
        return {error: `Element is <${selectEl.tagName.toLowerCase()}>, not a <select>`};
    }

    const options = Array.from(selectEl.options);
    try {(window as any).__tamperSlothGuidance?.cue(selectEl,'click');} catch { /* Decoration is optional. */ }

    let targetOption: HTMLOptionElement | undefined;

    if (val !== null) {
        targetOption = options.find((o) => o.value === val);
        if (!targetOption) {
            return {
                error: `No option with value "${val}"`,
                availableValues: options.map((o) => ({
                    value: o.value,
                    label: o.textContent?.trim(),
                })),
            };
        }
    } else if (lbl !== null) {
        const lowerLabel = lbl.toLowerCase();
        targetOption = options.find(
            (o) => o.textContent?.trim().toLowerCase() === lowerLabel
        );
        if (!targetOption) {
            return {
                error: `No option with label "${lbl}"`,
                availableLabels: options.map((o) => o.textContent?.trim()),
            };
        }
    } else if (idx !== null) {
        if (idx < 0 || idx >= options.length) {
            return {
                error: `Index ${idx} out of range — ${options.length} options available`,
            };
        }
        targetOption = options[idx];
    } else {
        return {error: "Provide at least one of: value, label, or index"};
    }

    selectEl.value = targetOption!.value;
    selectEl.dispatchEvent(new Event("input", {bubbles: true}));
    selectEl.dispatchEvent(new Event("change", {bubbles: true}));

    if (format === "concise") {
        return {selected: true, value: targetOption!.value};
    }
    return {
        selected: true,
        value: targetOption!.value,
        label: targetOption!.textContent?.trim(),
        optionIndex: targetOption!.index,
        totalOptions: options.length,
    };
}

/** Runs in the page for scrollPage. */
export function scrollInPage(
    dir: string,
    px: number | null,
    sel: string | null,
    scrollBehavior: ScrollBehavior,
    format: string
) {
    const concise = format === "concise";

    if (sel) {
        const el = document.querySelector(sel);
        if (!el) return {
            error: `No element found for selector: ${sel}`,
            hint: "Call getPageStructure to inspect the DOM and find valid selectors."
        };

        el.scrollIntoView({
            behavior: scrollBehavior,
            block: "center",
        });

        const rect = el.getBoundingClientRect();
        const base = {
            scrolledTo: sel,
            elementVisible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        };
        if (concise) return base;
        return {...base, scrollY: window.scrollY, scrollX: window.scrollX};
    }

    const scrollAmount = px ?? window.innerHeight * 0.85;
    const beforeY = window.scrollY;
    const beforeX = window.scrollX;

    switch (dir) {
        case "down":
            window.scrollBy({top: scrollAmount, behavior: scrollBehavior});
            break;
        case "up":
            window.scrollBy({top: -scrollAmount, behavior: scrollBehavior});
            break;
        case "right":
            window.scrollBy({left: scrollAmount, behavior: scrollBehavior});
            break;
        case "left":
            window.scrollBy({left: -scrollAmount, behavior: scrollBehavior});
            break;
        case "top":
            window.scrollTo({top: 0, behavior: scrollBehavior});
            break;
        case "bottom":
            window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: scrollBehavior,
            });
            break;
    }

    const atTop = window.scrollY === 0;
    const atBottom = window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 5;

    if (concise) {
        return {
            direction: dir,
            scrollable: document.documentElement.scrollHeight > window.innerHeight,
            reachedEnd: (dir === "down" || dir === "bottom") ? atBottom
                : (dir === "up" || dir === "top") ? atTop : false,
            atTop,
            atBottom,
        };
    }
    return {
        direction: dir,
        scrolledPixels: dir === "top" || dir === "bottom" ? null : scrollAmount,
        beforeY,
        beforeX,
        afterY: window.scrollY,
        afterX: window.scrollX,
        pageHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        scrollable: document.documentElement.scrollHeight > window.innerHeight,
        atTop,
        atBottom,
    };
}

/** Runs in the page for submitForm. */
export function submitFormInPage(sel: string, format: string) {
    let el = document.querySelector(sel);
    if (!el) {
        const formCount = document.querySelectorAll("form").length;
        return {error: `No element found for selector: ${sel}`, ...(formCount > 0 && {hint: formCount + " <form> elements exist. Call getPageStructure to find the right selector."})};
    }

    const form =
        el.tagName.toLowerCase() === "form"
            ? (el as HTMLFormElement)
            : el.closest("form");

    if (!form) {
        return {
            error: `No <form> found at or above selector: ${sel}`,
        };
    }

    const formInfo = format === "concise" ? undefined : {
        action: form.action,
        method: form.method,
        id: form.id || undefined,
        fieldCount: form.elements.length,
    };

    try {
        try {(window as any).__tamperSlothGuidance?.cue(form,'click');} catch { /* Decoration is optional. */ }
        form.requestSubmit();
    } catch {
        form.submit();
    }

    return {submitted: true, ...(formInfo && {form: formInfo})};
}

/** Runs in the page for fillForm. */
export function fillFormInPage(list: {selector: string; index: number; value: string}[], submitSelector: string | null, submitForm: boolean) {
    const fail = (i: number, error: string, extra = {}) => ({filled: i, failedField: i, error, ...extra});
    let last: Element | undefined;
    for (const [i, field] of list.entries()) {
        const el = document.querySelectorAll(field.selector)[field.index] as HTMLElement | undefined;
        if (!el) return fail(i, `No element for field ${i + 1}: ${field.selector}`);
        if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return fail(i, `Field ${i + 1} is disabled or read-only`);
        try {(window as any).__tamperSlothGuidance?.cue(el, 'type');} catch { /* Decoration is optional. */ }
        if (el instanceof HTMLSelectElement) {
            const wanted = field.value.trim().toLowerCase();
            const options = Array.from(el.options);
            const option = options.find(o => o.value === field.value) ?? options.find(o => (o.textContent ?? "").trim().toLowerCase() === wanted);
            if (!option) return fail(i, `No option "${field.value}" in field ${i + 1}`, {options: options.slice(0, 30).map(o => (o.textContent ?? "").trim())});
            el.value = option.value;
        } else if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
            const on = !/^(false|off|no|0|unchecked)$/i.test(field.value.trim());
            // A click flips it the way a person would, with the events frameworks listen for.
            if (el.checked !== on) el.click();
            last = el;
            continue;
        } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.focus();
            const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;
            if (setter) setter.call(el, field.value); else el.value = field.value;
        } else if (el.isContentEditable) {
            el.focus();
            el.textContent = field.value;
        } else return fail(i, `Field ${i + 1} (<${el.tagName.toLowerCase()}>) is not a form field`);
        el.dispatchEvent(new Event("input", {bubbles: true}));
        el.dispatchEvent(new Event("change", {bubbles: true}));
        last = el;
    }
    if (submitSelector) {
        const control = document.querySelector(submitSelector) as HTMLElement | null;
        if (!control) return {filled: list.length, error: `No submit control found for ${submitSelector}`};
        control.click();
        return {filled: list.length, submitted: true};
    }
    if (submitForm) {
        const form = last?.closest("form");
        if (!form) return {filled: list.length, error: "The last field is not inside a form; pass the submit control instead"};
        try { form.requestSubmit(); } catch { form.submit(); }
        return {filled: list.length, submitted: true};
    }
    return {filled: list.length};
}
