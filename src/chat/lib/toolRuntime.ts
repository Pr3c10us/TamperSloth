import {tool, type ToolSet} from "ai";
import {z} from "zod";
import {compactToolOutput, estimateImageTokens, estimateTextTokens, isFailed, resultReceipt, serialize, type ToolMetric} from "./efficiency";
import {skills} from "./skills";
import {browserImageOutput} from './browserTools';
import {stripReason, withReason} from "./toolReason";
import {createSafetyGate, type SafetyGateOptions} from "./safetyGate";

export const TOOL_GROUPS = {
    browsing: ["clickElement", "typeText", "selectOption", "scrollPage", "submitForm", "waitForElement", "navigateHistory", "reloadPage"],
    scripting: ["viewCodeFiles", "createFileTool", "strReplaceTool", "deleteFileTool", "executeContentScript", "saveScript", "listScripts", "toggleScript", "removeScript", "reloadPage"],
    debugging: ["getDebugInfo", "getLocalStorage", "getCookies"],
    visual: ["takeScreenshot", "takeMarkedScreenshot"],
    browser: ['browserTabs', 'accessibilityTree', 'persistentStore', 'siteRecipes', 'evaluateJavaScript'],
    input: ['clickTarget', 'browserGesture', 'trustedInput', 'deepDOM', 'takeMarkedScreenshot'],
    network: ['networkCapture', 'deepDOM'],
    system: ['clipboard', 'browserDownload', 'browserNotify'],
    guidance: ['annotatePage', 'waitForUserAction'],
} as const;
type Group = keyof typeof TOOL_GROUPS;
type ModelOutputOptions = Parameters<NonNullable<ToolSet[string]["toModelOutput"]>>[0];
const CORE = ["getCurrentTab", "getPageText", "getPageStructure", "getElementDetails", "navigateTo", "askUser", "getSkill", "enableTools", "readToolResult", 'annotatePage', 'waitForUserAction', 'wait'];
const PAGE_BARRIERS = new Set(['takeScreenshot', 'takeMarkedScreenshot', 'navigateTo', 'navigateHistory', 'reloadPage',
    'clickElement', 'typeText', 'selectOption', 'scrollPage', 'submitForm', 'waitForElement', 'executeContentScript',
    'saveScript', 'toggleScript', 'removeScript', 'evaluateJavaScript', 'clickTarget', 'browserGesture', 'trustedInput', 'annotatePage', 'waitForUserAction', 'wait']);
function needsPageBarrier(name: string, input: any) {
    return PAGE_BARRIERS.has(name) || name === 'browserTabs' && input.action !== 'list'
        || name === 'deepDOM' && input.action === 'evaluate' || name === 'networkCapture' && input.action === 'replay';
}

export interface ArchivedResult {name: string; input: unknown; output: unknown}

// Structural check: tool schemas may come from a different zod module instance.
function isZodObject(schema: unknown): schema is z.ZodObject {
    return (schema as z.ZodObject | undefined)?._zod?.def?.type === "object";
}

export function initialToolGroups(request: string): Group[] {
    const groups: Group[] = [];
    if (/\b(script|automatically|always|hide|remove|restyle|dark mode|css|every time)\b/i.test(request)) groups.push("scripting");
    if (/\b(click|fill|submit|scroll|select|search|browse|navigate|for me|do it|go ahead|yourself)\b/i.test(request)) groups.push("browsing");
    if (/\b(debug|error|broken|fails?|not working|console|network)\b/i.test(request)) groups.push("debugging");
    if (/\b(screenshot|layout|appearance|restyle|dark mode)\b/i.test(request)) groups.push("visual");
    if (/\b(tabs?|popups?|accessibility|recipes?|persistent|evaluate|javascript)\b/i.test(request)) groups.push('browser');
    if (/\b(hover|canvas|drag|touch|rich text|keyboard|shadow|iframe|cross-origin)\b/i.test(request)) groups.push('input');
    if (/\b(network|websocket|replay|requests?)\b/i.test(request)) groups.push('network');
    if (/\b(clipboard|downloads?|notifications?)\b/i.test(request)) groups.push('system');
    if (/\b(guide|guidance|walk|teach|show me|step.by.step|highlight|annotat\w*)\b/i.test(request)) groups.push('guidance');
    return groups;
}

type Projection = Awaited<ReturnType<NonNullable<ToolSet[string]["toModelOutput"]>>>;

/** Puts the safety notice ahead of a flagged result, whatever shape the projection has. */
function withNotice(projection: Projection, notice: string): Projection {
    if (projection.type === "text" || projection.type === "error-text") return {...projection, value: `${notice}\n\n${projection.value}`};
    if (projection.type === "content") return {...projection, value: [{type: "text" as const, text: notice}, ...projection.value]};
    if (projection.type === "json" || projection.type === "error-json") return {type: "text" as const, value: `${notice}\n\n${serialize(projection.value)}`};
    return projection;
}

function groupGuidance(group: Group): string {
    if (group === "scripting") return skills.script_creation_workflow.content + "\n" + skills.script_format.content;
    if (group === "debugging") return skills.debugging_workflow.content;
    return "";
}

/** Full results remain in the UI transcript; only the projection reaches the LLM. */
export function createToolRuntime(rawTools: ToolSet, options: {
    request: string;
    findPrevious: (id: string) => ArchivedResult | undefined;
    onResult?: (id: string, result: ArchivedResult) => void;
    /** Screens actions before they run and results before the model reads them. */
    safety?: Omit<SafetyGateOptions, "lookupMark">;
}) {
    let pageChain: Promise<void> = Promise.resolve();
    const enabled = new Set<string>(CORE);
    const groups = new Set<Group>(initialToolGroups(options.request));
    for (const group of groups) TOOL_GROUPS[group].forEach(name => enabled.add(name));
    const initialGuidance = [...groups].map(groupGuidance).filter(Boolean).join("\n");
    const archive = new Map<string, ArchivedResult>();
    const metrics = new Map<string, ToolMetric>();
    const seen = new Set<string>();
    const failureCounts = new Map<string, number>();
    const loadedSkills = new Set<string>();
    let repeatedFailure = "";
    const tools: ToolSet = {...rawTools};
    const safety = options.safety && createSafetyGate({...options.safety,
        // A mark target names an element from an earlier marked screenshot's legend.
        lookupMark: (snapshotId, mark) => {
            for (const entry of [...archive.values()].reverse()) {
                const output = entry.output as {snapshotId?: string; legend?: {id: number; selector?: string; name?: string; role?: string; tag?: string}[]} | null;
                if (output?.snapshotId !== snapshotId || !Array.isArray(output.legend)) continue;
                const item = output.legend.find(legend => legend.id === mark);
                return item ? {selector: item.selector, info: {label: item.name, role: item.role, tag: item.tag}} : undefined;
            }
            return undefined;
        }});

    tools.enableTools = tool({
        description: "Enable groups: browsing (DOM input), scripting (files/scripts), debugging, visual, browser (tabs/raw JS/AX/store/recipes), input (trusted CDP events/deep DOM/frames), network (CDP capture/WebSocket/replay), system (clipboard/downloads/notifications), guidance (page drawing and waiting for real user actions).",
        inputSchema: z.object({groups: z.array(z.enum(["browsing", "scripting", "debugging", "visual", "browser", "input", "network", "system", "guidance"])).min(1).max(9)}),
        execute: async ({groups: requested}) => {
            const added = [...new Set(requested)].filter(group => !groups.has(group));
            for (const group of added) {
                groups.add(group);
                TOOL_GROUPS[group].forEach(name => enabled.add(name));
            }
            return {enabled: [...groups], tools: added.flatMap(group => [...TOOL_GROUPS[group]]), guidance: added.map(groupGuidance).filter(Boolean)};
        },
    });
    tools.readToolResult = tool({
        description: "Read an archived result by resultId (tool call ID). Text uses character offsets; screenshots return the image. Use includeInput to recover original arguments.",
        inputSchema: z.object({resultId: z.string(), offset: z.number().int().min(0).default(0),
            length: z.number().int().min(100).max(5000).default(3000), includeInput: z.boolean().default(false)}),
        execute: async ({resultId, offset, length, includeInput}) => {
            const entry = archive.get(resultId) ?? options.findPrevious(resultId);
            if (!entry) return {error: "Result not found in this conversation. Reinspect the source."};
            if (entry.output && typeof entry.output === 'object' && 'screenshot' in entry.output && !includeInput) return entry.output;
            const text = serialize(includeInput ? entry.input : entry.output);
            let count = length;
            const page = () => ({resultId, tool: entry.name, offset, totalChars: text.length, text: text.slice(offset, offset + count),
                ...(offset + count < text.length ? {nextOffset: offset + count} : {})});
            // Escaped JSON can be much longer than its text. Keep each retrieval
            // below the projection cap so it never becomes another archive stub.
            while (count > 1 && serialize(page()).length > 5500) count = Math.floor(count / 2);
            return page();
        },
    });

    for (const [name, definition] of Object.entries(tools)) {
        const execute = definition.execute;
        if (!execute) continue;
        const originalProjection = definition.toModelOutput;
        tools[name] = {...definition,
            ...(isZodObject(definition.inputSchema) ? {inputSchema: withReason(definition.inputSchema)} : {}),
            execute: async (rawInput, callOptions) => {
                if (callOptions.abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
                // The reason is a UI title: implementations never see it, and it
                // does not make otherwise identical calls different.
                const input = stripReason(rawInput) as any;
                const signature = name + serialize(input);
                const repeated = seen.has(signature);
                seen.add(signature);
                const start = performance.now();
                let output: unknown;
                try {
                    if (callOptions.abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
                    const held = safety && await safety.check(name, input, {toolCallId: callOptions.toolCallId,
                        reason: (rawInput as {reason?: string}).reason, abortSignal: callOptions.abortSignal});
                    if (held) {
                        output = held;
                    } else if (name === "getSkill" && loadedSkills.has(input.skill_id)) {
                        output = {ok: true, alreadyLoaded: input.skill_id, hint: "The skill is already in this run's context."};
                    } else {
                        output = await execute(input, callOptions);
                        if (name === "getSkill" && !isFailed(output)) loadedSkills.add(input.skill_id);
                        // Deterministic dependent sequence: navigation already waits for readiness.
                        if (name === "navigateTo" && input.readText && !isFailed(output)) {
                            const navigation = output as Record<string, unknown>;
                            const wait = navigation.waitForSelector as {found?: boolean; error?: unknown} | undefined;
                            if (!wait?.error && wait?.found !== false) {
                                if (callOptions.abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
                                const page = await rawTools.getPageText.execute!({selector: input.readSelector, responseFormat: "concise", maxLength: 3000, offset: 0}, callOptions);
                                output = {...navigation, page};
                            }
                        }
                    }
                    if (callOptions.abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
                } catch (error) {
                    if (callOptions.abortSignal?.aborted) throw error;
                    output = {error: error instanceof Error ? error.message : String(error)};
                }
                safety?.inspect(callOptions.toolCallId, name, output);
                const failed = isFailed(output);
                const failures = failed ? (failureCounts.get(signature) ?? 0) + 1 : 0;
                failureCounts.set(signature, failures);
                if (failures >= 3) repeatedFailure = `${name} failed three times with the same arguments. Inspect the error before retrying.`;
                const entry = {name, input, output};
                archive.set(callOptions.toolCallId, entry);
                // A reason the model wrote counts toward argument tokens; the
                // empty default filled in for a missing one does not.
                const inputText = serialize((rawInput as {reason?: string}).reason ? rawInput : input);
                metrics.set(callOptions.toolCallId, {id: callOptions.toolCallId, name, inputChars: inputText.length, outputChars: serialize(output).length,
                    modelOutputChars: 0, inputTokens: estimateTextTokens(inputText), modelOutputTokens: 0, elapsedMs: Math.round(performance.now() - start), failed, repeated});
                options.onResult?.(callOptions.toolCallId, entry);
                return output;
            },
            toModelOutput: async ({toolCallId, input, output}: ModelOutputOptions) => {
                // Screenshot data is image content, never a base64 text payload.
                let projection;
                type Pixels = {width?: number; height?: number};
                const shot = output && typeof output === "object" && "screenshot" in output
                    ? output as {metadata?: {imagePixels?: Pixels}; postAction?: {metadata?: {imagePixels?: Pixels}}} : undefined;
                const imageTokens = shot ? estimateImageTokens(shot.metadata?.imagePixels ?? shot.postAction?.metadata?.imagePixels) : 0;
                // Tools with their own projection (e.g. gesture trimming) also handle screenshots.
                if (shot && (!originalProjection || isFailed(output))) {
                    projection = browserImageOutput(output);
                } else if (originalProjection && !isFailed(output)) {
                    projection = await originalProjection({toolCallId, input, output});
                } else {
                    projection = {type: "text" as const, value: serialize(compactToolOutput(output, toolCallId))};
                }
                const notice = safety?.notice(toolCallId);
                if (notice) projection = withNotice(projection, notice);
                const metric = metrics.get(toolCallId);
                if (metric) {
                    metric.modelOutputChars = serialize(projection).length;
                    // Base64 image data is not billed as text; count only text parts plus the image estimate.
                    const text = projection.type === "content"
                        ? projection.value.map(part => part.type === "text" ? part.text : "").join("")
                        : "value" in projection ? serialize(projection.value) : serialize(projection);
                    metric.modelOutputTokens = estimateTextTokens(text) + imageTokens;
                }
                return projection;
            },
        };
        const wrappedExecute = tools[name].execute!;
        tools[name].execute = async (input, callOptions) => {
            if (!needsPageBarrier(name, input)) return wrappedExecute(input, callOptions);
            // Reserve synchronously, before any await: a screenshot in
            // the same model batch must follow earlier mutations and tab changes.
            const previous = pageChain;
            let release!: () => void;
            pageChain = new Promise<void>(resolve => { release = resolve; });
            try {
                await previous;
                return await wrappedExecute(input, callOptions);
            } finally { release(); }
        };
    }
    return {tools, initialGuidance,
        activeTools: () => Object.keys(tools).filter(name => enabled.has(name)),
        metrics: () => [...metrics.values()],
        repeatedFailure: () => repeatedFailure,
        taskState: () => {
            const entries = [...archive].filter(([, entry]) => !["getSkill", "enableTools", "readToolResult"].includes(entry.name));
            const selected = new Map([
                ...entries.filter(([, entry]) => entry.name === "askUser").slice(-4),
                ...entries.filter(([, entry]) => entry.name === "saveScript").slice(-4),
                ...entries.filter(([, entry]) => entry.name === 'waitForUserAction').slice(-8),
                ...entries.slice(-6),
            ]);
            return [...selected].map(([id, entry]) => {
                const {hint: _hint, ...receipt} = resultReceipt(entry.output, id, 180);
                const input = entry.input as Record<string, unknown>;
                return {tool: entry.name, ...receipt,
                    ...(entry.name === "askUser" ? {question: input.question} : {}),
                    ...(entry.name==='waitForUserAction' ? {instruction:input.instruction,selector:input.selector,completion:input.completion,
                        guidanceStatus:(entry.output as any)?.status} : {}),
                    ...(typeof input.path === "string" ? {path: input.path} : {})};
            });
        },
    };
}
