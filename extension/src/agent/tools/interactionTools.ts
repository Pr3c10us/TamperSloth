import {tool} from "ai";
import {z} from "zod";
import {type ToolContext, responseFormatSchema, SETTLE_QUIET_MS} from "./toolContext";
import {selectorError, withSelectorHelp} from "./selectorHelp";
import {clickElementInPage, fillFormInPage, scrollInPage, selectOptionInPage, submitFormInPage, typeTextInPage} from "@/injected/tools/interaction";
import {pageQuiet} from "@/injected/tools/pageQuiet";
import {browserCall} from "./browserTools";

export function createInteractionTools(context: ToolContext) {
    const {chrome, targetOf, cue, changesSince, watchSubmission} = context;
    return {
        clickElement: tool({
            description:
                "Click an element by ref (from listControls or a changes report) or selector. Reports navigation and what the click changed (new controls with refs, dialogs, messages).",
            inputSchema: z.object({
                ref: z.string().optional().describe('Control ref such as "c12". Use instead of selector.'),
                selector: z
                    .string()
                    .optional()
                    .describe(
                        'CSS selector for the element to click, e.g. "button.submit", "#login-btn", ' +
                        '"a[href=\\"/about\\"]".'
                    ),
                index: z
                    .number()
                    .optional()
                    .default(0)
                    .describe(
                        "If multiple elements match the selector, click the one at this 0-based index (default: 0)."
                    ),
                waitAfter: z
                    .number()
                    .optional()
                    .default(500)
                    .describe(
                        "Most milliseconds to wait for the click's effects (default 500). Returns sooner once the page has changed and gone quiet."
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({ref, selector: given, index: givenIndex, waitAfter, responseFormat}) => {
                const target = await targetOf({ref, selector: given});
                if (!("selector" in target)) return target;
                // A ref's selector matches exactly one element.
                const selector = target.selector, index = ref ? 0 : givenIndex;
                await cue(selector, index, 'click');
                const beforeTab = await chrome.tabs.get(context.tabId);

                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: context.tabId},
                    func: clickElementInPage,
                    args: [selector, index ?? 0, waitAfter ?? 500, SETTLE_QUIET_MS, responseFormat ?? "concise"],
                });

                const afterTab = await chrome.tabs.get(context.tabId);
                const navigated = afterTab.url !== beforeTab.url;
                const clicked = (result?.result as {clicked?: boolean} | undefined)?.clicked;

                return {
                    ...await withSelectorHelp(context.tabId, selector, result?.result),
                    navigated,
                    ...(navigated && {
                        newUrl: afterTab.url,
                        newTitle: afterTab.title,
                    }),
                    ...(clicked ? await changesSince() : {}),
                };
            },
        }),

        typeText: tool({
            description:
                "Type into an input or editable element by ref or selector; optionally clear or press Enter. For several fields use fillForm. After Enter, or in a field that suggests (combobox, search), reports what changed.",
            inputSchema: z.object({
                ref: z.string().optional().describe('Control ref such as "c12". Use instead of selector.'),
                selector: z
                    .string()
                    .optional()
                    .describe(
                        'CSS selector for the input element, e.g. "input[name=\\"email\\"]", "#search-box", ' +
                        '"textarea.comment".'
                    ),
                text: z
                    .string()
                    .describe("The text to type into the element."),
                clearFirst: z
                    .boolean()
                    .optional()
                    .default(true)
                    .describe(
                        "If true (default), clear the field before typing. Set false to append to existing content."
                    ),
                pressEnter: z
                    .boolean()
                    .optional()
                    .default(false)
                    .describe(
                        "If true, simulate pressing Enter after typing the text. Useful for search fields."
                    ),
                index: z
                    .number()
                    .optional()
                    .default(0)
                    .describe(
                        "If multiple elements match, type into the one at this 0-based index (default: 0)."
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({ref, selector: given, text, clearFirst, pressEnter, index: givenIndex, responseFormat}) => {
                const target = await targetOf({ref, selector: given});
                if (!("selector" in target)) return target;
                const selector = target.selector, index = ref ? 0 : givenIndex;
                await cue(selector, index, 'type');
                const submission = pressEnter ? watchSubmission() : undefined;
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: context.tabId},
                    func: typeTextInPage,
                    args: [
                        selector,
                        text,
                        clearFirst ?? true,
                        pressEnter ?? false,
                        index ?? 0,
                        responseFormat ?? "concise",
                    ],
                });
                const typed = result?.result as {typed?: boolean; suggests?: boolean} | undefined;
                if (!typed?.typed) {
                    await submission?.(0);
                    return withSelectorHelp(context.tabId, selector, result?.result);
                }
                // Enter may submit or search; a suggesting field opens a list. Either way the next step depends on it.
                if (submission) {
                    const navigated = await submission(3000);
                    return {...typed, ...(navigated ? {navigated} : {}), ...await changesSince()};
                }
                if (typed.suggests) {
                    await globalThis.chrome.scripting.executeScript({target: {tabId: context.tabId}, func: pageQuiet, args: [SETTLE_QUIET_MS, 800, true]}).catch(() => {});
                    return {...typed, ...await changesSince()};
                }
                return typed;
            },
        }),

        selectOption: tool({
            description:
                "Select a native dropdown option by value, label or index. Name the <select> by ref or selector. Reports what the choice changed.",
            inputSchema: z.object({
                ref: z.string().optional().describe('Control ref such as "c12". Use instead of selector.'),
                selector: z
                    .string()
                    .optional()
                    .describe('CSS selector for the <select> element, e.g. "#country", "select[name=\\"size\\"]".'),
                value: z
                    .string()
                    .optional()
                    .describe(
                        'The option value attribute to select. E.g. "us", "large".'
                    ),
                label: z
                    .string()
                    .optional()
                    .describe(
                        'The visible text of the option to select. E.g. "United States", "Large".'
                    ),
                index: z
                    .number()
                    .optional()
                    .describe(
                        "The 0-based index of the option to select."
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({ref, selector: given, value, label, index, responseFormat}) => {
                const target = await targetOf({ref, selector: given});
                if (!("selector" in target)) return target;
                const selector = target.selector;
                await cue(selector, 0, 'click');
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: context.tabId},
                    func: selectOptionInPage,
                    args: [selector, value ?? null, label ?? null, index ?? null, responseFormat ?? "concise"],
                });
                const selected = result?.result as {selected?: boolean} | undefined;
                // A choice often reveals or changes other fields.
                return selected?.selected ? {...selected, ...await changesSince()} : result?.result;
            },
        }),

        scrollPage: tool({
            description:
                "Scroll by direction/amount or to an element.",
            inputSchema: z.object({
                direction: z
                    .enum(["up", "down", "left", "right", "top", "bottom"])
                    .optional()
                    .default("down")
                    .describe('Scroll direction or position. "top"/"bottom" scroll to the very top/bottom.'),
                amount: z
                    .number()
                    .optional()
                    .describe(
                        'Pixels to scroll (for up/down/left/right). Default: one viewport height. ' +
                        "Ignored for top/bottom."
                    ),
                selector: z
                    .string()
                    .optional()
                    .describe(
                        "CSS selector — if provided, either scroll this container (if it's scrollable) " +
                        "or scroll the page until this element is visible."
                    ),
                behavior: z
                    .enum(["smooth", "instant"])
                    .optional()
                    .default("smooth")
                    .describe('Scroll behavior: "smooth" (animated) or "instant".'),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({direction, amount, selector, behavior, responseFormat}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                await browserCall('guidance',{tabId: context.tabId,action:'cue',selector,cue:'scroll'}).catch(()=>{});
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: context.tabId},
                    func: scrollInPage,
                    args: [
                        direction ?? "down",
                        amount ?? null,
                        selector ?? null,
                        (behavior ?? "smooth") as ScrollBehavior,
                        responseFormat ?? "concise",
                    ],
                });
                return withSelectorHelp(context.tabId, selector, result.result);
            },
        }),

        submitForm: tool({
            description:
                "Submit a form, then wait for the navigation it starts or, when the page handles it in place, for the page to settle. Reports what changed (messages, invalid fields, new controls). Obtain confirmation for consequential submissions.",
            inputSchema: z.object({
                ref: z.string().optional().describe('Ref of the form or of a control inside it. Use instead of selector.'),
                selector: z
                    .string()
                    .optional()
                    .describe(
                        'CSS selector for the <form> element, e.g. "#login-form", "form[action=\\"/search\\"]". ' +
                        "If the selector points to an element inside a form, the closest parent form is submitted."
                    ),
                timeout: z
                    .number()
                    .optional()
                    .default(5000)
                    .describe(
                        "Maximum time in ms to wait for a navigation the submission starts (default: 5000)."
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({ref, selector: given, timeout, responseFormat}) => {
                const target = await targetOf({ref, selector: given});
                if (!("selector" in target)) return target;
                const selector = target.selector;
                await cue(selector, 0, 'click');
                const timeoutMs = timeout ?? 5000;
                const beforeTab = await chrome.tabs.get(context.tabId);
                const submission = watchSubmission();

                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: context.tabId},
                    func: submitFormInPage,
                    args: [selector, responseFormat ?? "concise"],
                }).catch(async error => { await submission(0); throw error; });
                const submitted = (result?.result as {submitted?: boolean} | undefined)?.submitted;
                const navigated = await submission(submitted ? timeoutMs : 0);

                const afterTab = await chrome.tabs.get(context.tabId);

                return {
                    ...result?.result,
                    navigated,
                    ...(navigated && afterTab.url !== beforeTab.url && {
                        newUrl: afterTab.url,
                        newTitle: afterTab.title,
                    }),
                    ...(submitted ? await changesSince() : {}),
                };
            },
        }),

        fillForm: tool({
            description:
                "Fill several form fields in one call, in order: text inputs, textareas, contenteditable, selects (by option value or visible label) " +
                "and checkboxes/radios (value \"true\" or \"false\"). Name each field by ref (from listControls or a changes report) or selector. " +
                "Stops at the first field it cannot fill. submit then clicks a control (e.g. the Save button) or, with true, submits the last field's form, " +
                "and waits like submitForm. Reports what changed. Obtain confirmation for consequential submissions.",
            inputSchema: z.object({
                fields: z.array(z.object({
                    ref: z.string().optional(),
                    selector: z.string().optional(),
                    index: z.number().int().min(0).optional(),
                    value: z.string(),
                })).min(1).max(30),
                submit: z.union([z.boolean(), z.object({ref: z.string().optional(), selector: z.string().optional()})]).optional()
                    .describe('A control to click after filling, or true to submit the form of the last field.'),
                timeout: z.number().int().min(500).max(15000).default(5000)
                    .describe('Maximum time in ms to wait for a navigation the submission starts.'),
            }),
            execute: async ({fields, submit, timeout}) => {
                const resolved: {selector: string; index: number; value: string}[] = [];
                for (const [i, field] of fields.entries()) {
                    const target = await targetOf(field);
                    if (!("selector" in target)) return {...target, failedField: i, filled: 0};
                    resolved.push({selector: target.selector, index: field.ref ? 0 : field.index ?? 0, value: field.value});
                }
                const submitTarget = submit && typeof submit === "object" ? await targetOf(submit) : undefined;
                if (submitTarget && !("selector" in submitTarget)) return {...submitTarget, failedField: "submit", filled: 0};
                await cue(resolved[0].selector, resolved[0].index, 'type');
                const submission = submit ? watchSubmission() : undefined;
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: context.tabId},
                    func: fillFormInPage,
                    args: [resolved, submitTarget && "selector" in submitTarget ? submitTarget.selector : null, submit === true],
                }).catch(async error => { await submission?.(0); throw error; });
                const output = (result?.result ?? {error: "The page did not report a result"}) as {filled?: number; submitted?: boolean; error?: string};
                const navigated = submission ? await submission(output.submitted ? timeout : 0) : false;
                return {...output, ...(navigated ? {navigated} : {}), ...(output.filled ? await changesSince() : {})};
            },
        }),
    };
}
