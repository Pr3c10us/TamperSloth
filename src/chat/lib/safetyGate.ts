import {
    assessAction, decide, describeTarget, parseVerdict, screenPrompt, SCREENER_INSTRUCTIONS,
    type ApprovalMode, type FlaggedContent, type ScreenVerdict, type TargetInfo,
} from "./actionScreen";
import {injectionNotice, injectionRegions, scanUntrusted, type InjectionScan} from "./contentScreen";
import {requestConfirmation, type ConfirmAnswer} from "./confirmBus";

/** What the safety layer did around one tool call, shown on its step. */
export interface ToolSafety {
    /** Injection signals found in the call's result. */
    injection?: string[];
    /** How screening settled the call before it ran. */
    verdict?: "approved" | "declined" | "blocked" | "screened";
    note?: string;
}

/** How to find an element in the live page. */
export interface TargetSpec {
    selector?: string;
    index?: number;
    x?: number;
    y?: number;
    focused?: boolean;
    /** Known without asking the page (role+name, text and mark targets). */
    known?: TargetInfo;
}

/** Results whose text the model never reads as page content. */
const UNSCANNED = new Set(["getSkill", "enableTools", "askUser", "listScripts", "browserNotify"]);
const PAGE_LOOKUP_MS = 1500;

/** Runs in the page: describes the elements an action is about to touch. */
function inspectTargets(specs: TargetSpec[]) {
    const clean = (text: unknown) => String(text ?? "").replace(/\s+/g, " ").trim();
    const deepActive = () => {
        let active = document.activeElement;
        while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
        return active;
    };
    const labelsOf = (el: Element) => {
        const parts: string[] = [];
        for (const label of Array.from((el as HTMLInputElement).labels ?? [])) parts.push(label.innerText);
        for (const id of (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)) parts.push(document.getElementById(id)?.innerText ?? "");
        return parts.join(" ");
    };
    const sensitiveForm = (form: Element | null) => !!form?.querySelector(
        'input[type=password],input[autocomplete^="cc-"],input[autocomplete="one-time-code"],input[name*="card" i],input[name*="cvv" i],input[name*="cvc" i],input[name*="password" i]');
    const describe = (found: Element | null) => {
        if (!found || found === document.body || found === document.documentElement) return null;
        const el = found.closest('a[href],button,input,textarea,select,[role],[contenteditable="true"],form') ?? found;
        const form = el.localName === "form" ? el : (el as HTMLInputElement).form ?? el.closest("form");
        const text = el.getAttribute("aria-label") || (el as HTMLElement).innerText || (el as HTMLInputElement).value
            || el.getAttribute("title") || el.getAttribute("alt") || "";
        return {
            label: clean(text).slice(0, 120) || undefined,
            tag: el.localName,
            type: el.getAttribute("type")?.toLowerCase() || undefined,
            role: el.getAttribute("role") || undefined,
            autocomplete: el.getAttribute("autocomplete") || undefined,
            fieldHints: clean([el.getAttribute("name"), el.id, el.getAttribute("placeholder"), labelsOf(el),
                el.hasAttribute("download") ? "download" : ""].filter(Boolean).join(" ")).slice(0, 200) || undefined,
            href: (el.closest("a[href]") as HTMLAnchorElement | null)?.href || undefined,
            formSensitive: sensitiveForm(form),
            formAction: (form as HTMLFormElement | null)?.action || undefined,
        };
    };
    return specs.map(spec => {
        try {
            if (spec.focused) return describe(deepActive());
            if (spec.selector) return describe(document.querySelectorAll(spec.selector)[spec.index ?? 0] ?? null);
            if (typeof spec.x === "number" && typeof spec.y === "number") return describe(document.elementFromPoint(spec.x, spec.y));
        } catch { /* An invalid selector fails in the tool itself. */ }
        return null;
    });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    return Promise.race([promise, new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), ms))]);
}

async function readPageTargets(tabId: number, specs: TargetSpec[]): Promise<(TargetInfo | undefined)[]> {
    const pageSpecs = specs.map(spec => spec.known ? {} : spec);
    let found: (TargetInfo | null)[] = [];
    if (tabId > 0 && pageSpecs.some(spec => spec.selector || spec.focused || spec.x !== undefined)) {
        try {
            const results = await withTimeout(chrome.scripting.executeScript({target: {tabId}, func: inspectTargets, args: [pageSpecs]}), PAGE_LOOKUP_MS);
            found = (results?.[0]?.result as (TargetInfo | null)[] | undefined) ?? [];
        } catch { /* Pages we cannot script are judged from the arguments alone. */ }
    }
    return specs.map((spec, i) => found[i] ? {...spec.known, ...found[i]!} : spec.known);
}

type Target = { selector?: string; index?: number; role?: string; name?: string; text?: string; mark?: number; snapshotId?: string; x?: number; y?: number };

/** The page elements a tool call acts on, one spec per targeted step. */
export function targetSpecs(name: string, input: Record<string, any>, lookupMark: (snapshotId: string, mark: number) => {selector?: string; info: TargetInfo} | undefined): TargetSpec[] {
    const fromTarget = (target?: Target): TargetSpec => {
        if (!target) return {focused: true};
        if (target.selector) return {selector: target.selector, index: target.index};
        if (target.mark !== undefined && target.snapshotId) {
            const mark = lookupMark(target.snapshotId, target.mark);
            return mark?.selector ? {selector: mark.selector, known: mark.info} : {known: mark?.info};
        }
        if (target.name || target.text) return {known: {label: target.name ?? target.text, role: target.role}};
        if (typeof target.x === "number" && typeof target.y === "number") return {x: target.x, y: target.y};
        return {focused: true};
    };
    switch (name) {
        case "clickElement":
        case "typeText":
        case "submitForm":
            return [{selector: input.selector, index: input.index}];
        case "clickTarget":
            return [fromTarget(input.target)];
        case "trustedInput":
            return input.action === "text" ? [{focused: true}] : input.action === "mouse" ? [{x: input.x, y: input.y}] : [];
        case "browserGesture": {
            // Typing without a target goes where the batch last clicked, else to the focused element.
            let lastClicked: TargetSpec = {focused: true};
            return (input.gestures ?? []).map((step: {action?: string; target?: Target}) => {
                if (step.action === "click") return lastClicked = fromTarget(step.target);
                if (step.action === "type" || step.action === "press") return step.target ? fromTarget(step.target) : lastClicked;
                return {};
            });
        }
        default:
            return [];
    }
}

export interface SafetyGateOptions {
    conversationId: string;
    /** The user's message that started this run. */
    request: string;
    mode: ApprovalMode;
    /** Asks a model for a verdict; without it, flagged actions go to the user. */
    screen?: (instructions: string, prompt: string, signal?: AbortSignal) => Promise<string>;
    onSafety?: (toolCallId: string, safety: ToolSafety) => void;
    lookupMark?: (snapshotId: string, mark: number) => {selector?: string; info: TargetInfo} | undefined;
    readScript?: (path: string) => Promise<string | null>;
    /** Overrides the page lookup (tests). */
    readTargets?: (tabId: number, specs: TargetSpec[]) => Promise<(TargetInfo | undefined)[]>;
    /** Overrides the confirmation card (tests). */
    confirm?: typeof requestConfirmation;
}

/** What the model receives instead of a result when an action does not run. */
export type HeldOutput = { error: string; blocked?: true; declined?: true; hint: string };

/**
 * One run's safety state: which results were flagged as possible prompt
 * injection, which tab actions land in, and whether the user allowed every
 * remaining action.
 */
export function createSafetyGate(options: SafetyGateOptions) {
    const flagged: FlaggedContent[] = [];
    const scans = new Map<string, InjectionScan>();
    let tabId = Number(new URLSearchParams(globalThis.location?.search ?? "").get("tabId")) || 0;
    let allowAll = false;
    const readTargets = options.readTargets ?? readPageTargets;
    const confirm = options.confirm ?? requestConfirmation;
    const lookupMark = options.lookupMark ?? (() => undefined);

    const held = (kind: "blocked" | "declined", why: string): HeldOutput => kind === "blocked"
        ? {error: `Blocked by Tampersloth's safety screening: ${why}`, blocked: true,
            hint: "Do not retry this action or work around the block. Tell the user what was blocked and why, and ask how they want to proceed."}
        : {error: "The user declined this action.", declined: true,
            hint: "Do not retry it or reach the same result another way. Continue with other parts of the task if they do not depend on it, or ask the user how to proceed."};

    return {
        /**
         * Screens a call before it runs. Returns nothing when it may run, or the
         * output to give the model instead.
         */
        async check(name: string, input: Record<string, any>, call: {toolCallId: string; reason?: string; abortSignal?: AbortSignal}): Promise<HeldOutput | undefined> {
            const quick = assessAction(name, input);
            if (quick.risk === "none" || quick.risk === "low" && !flagged.length) return undefined;

            const specs = targetSpecs(name, input, lookupMark);
            const targets = specs.length ? await readTargets(input.tabId ?? tabId, specs) : [];
            const code = (name === "executeContentScript" || name === "saveScript") && typeof input.path === "string" && options.readScript
                ? await options.readScript(input.path).catch(() => null) ?? undefined : undefined;
            const assessment = assessAction(name, input, targets, code);
            const decision = decide(assessment, {mode: options.mode, flagged, allowAll});
            const target = targets.map(describeTarget).find(Boolean)
                ?? (typeof input.url === "string" ? input.url : undefined);
            const report = (safety: ToolSafety) => options.onSafety?.(call.toolCallId, safety);

            if (decision.kind === "allow") return undefined;
            if (decision.kind === "block") {
                const why = decision.reasons[0] ?? "the action looks unsafe";
                report({verdict: "blocked", note: why});
                return held("blocked", why);
            }

            let reasons = decision.reasons;
            let injection = decision.kind === "confirm" && decision.injection;
            if (decision.kind === "screen") {
                let verdict: ScreenVerdict = {verdict: "confirm", reason: "Page content in this task was flagged as a possible prompt injection."};
                if (options.screen) {
                    try {
                        verdict = parseVerdict(await options.screen(SCREENER_INSTRUCTIONS, screenPrompt({
                            userRequest: options.request, tool: name, reason: call.reason, input, target,
                            risks: assessment.reasons, flagged,
                        }), call.abortSignal));
                    } catch (error) {
                        if (call.abortSignal?.aborted) throw error;
                    }
                }
                if (verdict.verdict === "allow") {
                    report({verdict: "screened", note: verdict.reason || "Checked against flagged page content and allowed."});
                    return undefined;
                }
                if (verdict.verdict === "block") {
                    const why = verdict.reason || "it appears to follow instructions from page content rather than your request";
                    report({verdict: "blocked", note: why});
                    return held("blocked", why);
                }
                reasons = [...(verdict.reason ? [verdict.reason] : []), ...reasons];
                injection = true;
            }

            const answer: ConfirmAnswer = await confirm(options.conversationId, {
                id: call.toolCallId,
                title: call.reason?.trim() || defaultTitle(name, input),
                target,
                reasons: reasons.length ? reasons : ["This action changes something in your browser."],
                injection,
                allowAll: options.mode === "ask" && !assessment.confirm && !injection,
            }, call.abortSignal);
            if (answer === "deny") {
                report({verdict: "declined"});
                return held("declined", "");
            }
            if (answer === "allow-all") allowAll = true;
            report({verdict: "approved"});
            return undefined;
        },

        /** Scans a result for injected instructions; tracks tab switches. */
        inspect(toolCallId: string, name: string, output: unknown): InjectionScan | undefined {
            const value = output as Record<string, any> | null;
            if (name === "browserTabs" && value && typeof value.tabId === "number" && !value.error) tabId = value.tabId;
            if (UNSCANNED.has(name) || !value) return undefined;
            const scan = scanUntrusted(output);
            if (!scan.flagged) return undefined;
            scans.set(toolCallId, scan);
            flagged.push({tool: name, text: injectionRegions(scan.text, scan.signals), signals: scan.signals.map(s => `${s.label}: "${s.snippet}"`)});
            options.onSafety?.(toolCallId, {injection: scan.signals.map(signal => signal.label)});
            return scan;
        },

        /** The warning to place before a flagged result in the model's context. */
        notice(toolCallId: string): string | undefined {
            const scan = scans.get(toolCallId);
            return scan ? injectionNotice(scan) : undefined;
        },

        flaggedCount: () => flagged.length,
    };
}

export type SafetyGate = ReturnType<typeof createSafetyGate>;

function defaultTitle(name: string, input: Record<string, any>): string {
    switch (name) {
        case "browserDownload": return `Download ${input.filename || input.url || "a file"}`;
        case "navigateTo": return `Open ${input.url}`;
        case "typeText": return "Type into a field on the page";
        case "submitForm": return "Submit a form";
        case "evaluateJavaScript":
        case "executeContentScript": return "Run a script on the page";
        default: return `Run ${name}`;
    }
}
