import {tool, type ToolSet} from "ai";
import {z} from "zod";
import {compactToolOutput, estimateImageTokens, estimateTextTokens, isFailed, resultReceipt, serialize, type ToolMetric} from "./efficiency";
import {skills} from "./skills";
import {browserImageOutput} from './browserTools';

export const TOOL_GROUPS = {
    browsing: ["clickElement", "typeText", "selectOption", "scrollPage", "submitForm", "waitForElement", "navigateHistory", "reloadPage"],
    scripting: ["viewCodeFiles", "createFileTool", "strReplaceTool", "deleteFileTool", "executeContentScript", "saveScript", "listScripts", "toggleScript", "removeScript", "reloadPage"],
    debugging: ["getDebugInfo", "getLocalStorage", "getCookies"],
    visual: ["takeScreenshot", "takeMarkedScreenshot"],
    tracking: ["TodoWrite", "TodoRead", "TodoClear"],
    browser: ['browserTabs', 'accessibilityTree', 'persistentStore', 'siteRecipes', 'evaluateJavaScript'],
    input: ['clickTarget', 'browserGesture', 'trustedInput', 'deepDOM', 'takeMarkedScreenshot'],
    network: ['networkCapture', 'deepDOM'],
    system: ['clipboard', 'browserDownload', 'browserNotify'],
    guidance: ['annotatePage', 'waitForUserAction'],
} as const;
type Group = keyof typeof TOOL_GROUPS;
type ModelOutputOptions = Parameters<NonNullable<ToolSet[string]["toModelOutput"]>>[0];
const CORE = ["getCurrentTab", "getPageText", "getPageStructure", "getElementDetails", "navigateTo", "askUser", "getSkill", "enableTools", "readToolResult", 'annotatePage', 'waitForUserAction'];
const PAGE_BARRIERS = new Set(['takeScreenshot', 'takeMarkedScreenshot', 'navigateTo', 'navigateHistory', 'reloadPage',
    'clickElement', 'typeText', 'selectOption', 'scrollPage', 'submitForm', 'waitForElement', 'executeContentScript',
    'saveScript', 'toggleScript', 'removeScript', 'evaluateJavaScript', 'clickTarget', 'browserGesture', 'trustedInput', 'annotatePage', 'waitForUserAction']);
function needsPageBarrier(name: string, input: any) {
    return PAGE_BARRIERS.has(name) || name === 'browserTabs' && input.action !== 'list'
        || name === 'deepDOM' && input.action === 'evaluate' || name === 'networkCapture' && input.action === 'replay';
}

export interface ArchivedResult {name: string; input: unknown; output: unknown}

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

function groupGuidance(group: Group): string {
    if (group === "scripting") return skills.script_creation_workflow.content + "\n" + skills.script_format.content;
    if (group === "debugging") return skills.debugging_workflow.content;
    if (group === "tracking") return skills.task_tracking.content;
    return "";
}

/** Full results remain in the UI transcript; only the projection reaches the LLM. */
export function createToolRuntime(rawTools: ToolSet, options: {
    request: string;
    findPrevious: (id: string) => ArchivedResult | undefined;
    onResult?: (id: string, result: ArchivedResult) => void;
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

    tools.enableTools = tool({
        description: "Enable groups: browsing (DOM input), scripting (files/scripts), debugging, visual, tracking, browser (tabs/raw JS/AX/store/recipes), input (trusted CDP events/deep DOM/frames), network (CDP capture/WebSocket/replay), system (clipboard/downloads/notifications), guidance (page drawing and waiting for real user actions).",
        inputSchema: z.object({groups: z.array(z.enum(["browsing", "scripting", "debugging", "visual", "tracking", "browser", "input", "network", "system", "guidance"])).min(1).max(10)}),
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
            execute: async (input, callOptions) => {
                if (callOptions.abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
                // UI descriptions do not make otherwise identical calls different.
                const {description: _description, ...argumentsOnly} = input as Record<string, unknown>;
                const signature = name + serialize(argumentsOnly);
                const repeated = seen.has(signature);
                seen.add(signature);
                const start = performance.now();
                let output: unknown;
                try {
                    if (callOptions.abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
                    if (name === "getSkill" && loadedSkills.has(input.skill_id)) {
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
                const failed = isFailed(output);
                const failures = failed ? (failureCounts.get(signature) ?? 0) + 1 : 0;
                failureCounts.set(signature, failures);
                if (failures >= 3) repeatedFailure = `${name} failed three times with the same arguments. Inspect the error before retrying.`;
                const entry = {name, input, output};
                archive.set(callOptions.toolCallId, entry);
                const inputText = serialize(input);
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
                    projection = {type: "text" as const, value: serialize(compactToolOutput(name, output, toolCallId))};
                }
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
