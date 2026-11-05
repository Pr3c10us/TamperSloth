import {type ModelMessage, type TextStreamPart, type ToolSet, generateText, isStepCount, streamText} from "ai";
import {getAccount, refreshAccount} from "@/account/account";
import {loadAgentSettings, onAgentSettingsChange, runStopReason, withPlanRunBudget, type AgentSettings} from "@/agent/agentSettings";
import type {PendingAttachment} from "@/agent/conversation/attachments";
import {generateChatTitle, requestTitle, titleProviderOptions} from "@/agent/conversation/chatTitle";
import {withInjected} from "@/agent/conversation/historyMessages";
import {commitEdit} from "@/agent/conversation/messageEditing";
import {draftFromQueued, queueMessage} from "@/agent/conversation/messageQueue";
import {finishTaskTabs, getSession, patchSession, runs, updateMessages, updateSession} from "@/agent/conversation/sessions";
import type {PickedElement, ToolCall} from "@/agent/conversation/types";
import {prepareUserMessage, toModelMessages} from "@/agent/conversation/userMessage";
import {creditsExhaustedError, setCreditsExhausted} from "@/agent/models/credits";
import {formatModelName, getModel, MODELPROVIDERS, type ModelOptions, type ProviderId} from "@/agent/models/provider";
import {agentProviderOptions} from "@/agent/models/providerCompatibility";
import {withRateLimits} from "@/agent/models/rateLimit";
import {createReasoningNormalizer, type NormalizedEvent} from "@/agent/models/reasoning";
import {RUN_HEADER} from "@/agent/models/slothModel";
import {playbooks} from "@/agent/prompt/playbookCatalog";
import {loadedPlaybookIds, renderPlaybookIndex} from "@/agent/prompt/playbooks";
import SYSTEM_PROMPT from "@/agent/prompt/systemPrompt";
import {setTaskStatus} from "@/agent/tools/browserTools";
import {createAgentTools} from "@/agent/tools/createAgentTools";
import {holdsTab, othersHoldTabs, releaseTabs} from "@/agent/tools/tabLease";
import {clip, isFailed, serialize} from "@/agent/tools/toolOutput";
import {partialReason} from "@/agent/tools/toolReason";
import {createToolRuntime} from "@/agent/tools/toolRuntime";
import type {Quote} from "@/shared/panelRequests";
import {getApiKeys, VERTEX_PROJECT_KEY} from "@/storage/apiKeys";
import {readFile, writeFile} from "@/storage/codeFiles";
import {loadAttachment} from "@/storage/conversations";
import {createStepMessagePreparer} from "./contextCompaction";
import {createGuidanceGuard, GUIDANCE_RESUME_NOTE} from "./guidanceGuard";
import {createMidRunMessages} from "./midRunMessages";
import {ANTHROPIC_CACHE_BREAKPOINT, markCachePrefix} from "./promptCache";
import {closeThinking, createReplyWriter, type ReplyWriter} from "./replyWriter";
import {loadTabContext} from "./runContext";
import {createRunMeter, sumUsage, usageRecord, type UsageRecord} from "./runMetrics";
import {createWriteTracker, cutOffNote, interruptedNote, lastStepAppended, MAX_CUTOFF_RESUMES, MAX_FRUITLESS_CUTOFFS, reportResult, withoutCutOffStep} from "./writeRecovery";

/** Starts a run for the message, or queues it for the next step if the chat's run is already working. */
export async function sendMessage(
    conversationId: string,
    text: string,
    providerId: ProviderId,
    apiKey: string,
    modelId?: string,
    elementContext?: PickedElement[],
    attachments?: PendingAttachment[],
    quotes?: Quote[],
) {
    // Mid-run, the message waits for the run's next step instead of starting another run.
    if (getSession(conversationId)?.isLoading) {
        queueMessage(conversationId, {text, pickedElements: elementContext, attachments, quotes, model: {providerId, apiKey, modelId}});
        return;
    }
    const run = await beginRun(conversationId, text, providerId, apiKey, modelId, elementContext, attachments, quotes);
    try {
        await driveModel(run);
    } catch (err: any) {
        run.failed = true;
        if (err.name === "AbortError" || run.abortController.signal.aborted) {
            // intentionally ignored
        } else if (creditsExhaustedError(err)) {
            setCreditsExhausted(conversationId, creditsExhaustedError(err));
            void refreshAccount();
        } else {
            patchSession(conversationId, {error: err.message ?? "Something went wrong"});
        }
    } finally {
        await finishRun(run);
    }
}

/** Puts the user's message and an empty reply in the chat, and starts everything the run will need. */
async function beginRun(
    conversationId: string,
    text: string,
    providerId: ProviderId,
    apiKey: string,
    modelId: string | undefined,
    elementContext: PickedElement[] | undefined,
    attachments: PendingAttachment[] | undefined,
    quotes: Quote[] | undefined,
) {
    const started = performance.now();
    const startedAt = Date.now();
    const resolvedModelId = modelId ?? MODELPROVIDERS.find(p => p.id === providerId)!.defaultModel;
    const abortController = new AbortController();
    runs.set(conversationId, abortController);
    patchSession(conversationId, {error: null, isLoading: true});
    setCreditsExhausted(conversationId, null);
    const editNote = commitEdit(conversationId);
    // Setup lookups don't depend on each other, so they all start now and are awaited where needed.
    const modelOptionsReady: Promise<ModelOptions> = providerId === "vertex"
        ? getApiKeys().catch((): Record<string, string> => ({})).then(keys => ({vertexProject: keys[VERTEX_PROJECT_KEY]}))
        : Promise.resolve({});
    // The server holds each Sloth run to the plan's budget; stopping at it here ends the run cleanly.
    const planBudgetReady = providerId === "tampersloth" ? getAccount().then(account => account?.plan.runTokenBudget, () => undefined) : Promise.resolve(undefined);
    const settingsReady = loadAgentSettings();
    const tabContextReady = loadTabContext(conversationId, text);
    const modelOptions = await modelOptionsReady;

    const {message: userMsg, files: sentFiles, saved: attachmentsSaved} =
        await prepareUserMessage(conversationId, text, elementContext, attachments, quotes);
    if (editNote) userMsg.editNote = editNote;

    const previous = getSession(conversationId)?.messages ?? [];
    const isFirstMessage = !previous.some(m => m.role === "user");
    const updatedMessages = [...previous, userMsg];
    updateMessages(conversationId, () => updatedMessages);

    if (isFirstMessage) {
        void nameChat(conversationId, {
            text,
            attachmentNames: userMsg.attachments?.map(a => a.name),
            pickedElements: elementContext?.length,
            quotes,
            getTitleModel: titleModelId => getModel(providerId, apiKey, titleModelId, undefined, modelOptions),
            providerId,
            modelId: resolvedModelId,
        });
    }
    // This message's files go to the model from memory; storing them needn't hold up the run (failures still show).
    void attachmentsSaved;

    const modelMessages = await toModelMessages(updatedMessages, sentFiles);

    const reply = createReplyWriter(conversationId);
    const meter = createRunMeter({providerId, modelId: resolvedModelId, startedAt});
    updateMessages(conversationId, (messages) => [
        ...messages,
        {id: reply.id, role: "assistant", content: "", toolCalls: [], blocks: [],
            runMetrics: {providerId, modelId: resolvedModelId, startedAt,
                steps: [], tools: [], compactedResults: 0, elapsedMs: 0}},
    ]);
    // What the reply is streaming, so whatever a cut-off or a stop leaves part-written can be kept.
    const writes = createWriteTracker({
        read: (path) => readFile(conversationId, path),
        write: (path, content) => writeFile(conversationId, path, content),
    });

    return {
        conversationId, text, quotes, providerId, apiKey, modelId: resolvedModelId, modelOptions,
        started, startedAt, abortController,
        planBudgetReady, settingsReady, tabContextReady,
        updatedMessages, modelMessages, sentFiles,
        reply, meter, writes,
        midRun: createMidRunMessages({conversationId, signal: abortController.signal, reply, meter}),
        failed: false,
        // The permission mode can be switched from the composer while the run works.
        stopWatchingApproval: () => {},
    };
}

type Run = Awaited<ReturnType<typeof beginRun>>;

/** Names a chat from its first message, alongside the run and whichever chat is on screen when it arrives. */
async function nameChat(conversationId: string, request: {
    text: string;
    attachmentNames?: string[];
    pickedElements?: number;
    quotes?: Quote[];
    getTitleModel: (modelId: string) => ReturnType<typeof getModel>;
    providerId: ProviderId;
    modelId: string;
}) {
    const {text, attachmentNames, pickedElements, quotes, getTitleModel, providerId, modelId} = request;
    const fallback = requestTitle(text) || requestTitle(quotes?.[0]?.text ?? "") || attachmentNames?.[0] || "Untitled";
    let named = "";
    try {
        // A title is a few words: Sloth chats name themselves on the cheapest Sloth model.
        const titleModelId = providerId === "tampersloth" ? "sloth-mini" : modelId;
        named = await generateChatTitle(getTitleModel(titleModelId), providerId, {
            text,
            attachmentNames,
            pickedElements,
            quotes: quotes?.map(q => q.text),
        }, titleModelId);
    } catch (error) {
        console.warn("[Tampersloth] chat title failed", error);
    }
    patchSession(conversationId, {title: named || fallback});
}

/** Keeps anything the reply left part-written, and shows each such call as finished. */
async function settleWrites(run: Run, cutOff: boolean) {
    const reports = await run.writes.settle({cutOff}).catch((error) => {
        console.warn("[Tampersloth] Could not keep a part-written file:", error);
        return [];
    });
    for (const report of reports) {
        const result = reportResult(report);
        run.reply.updateToolCall(report.id, (call): ToolCall =>
            ({...call, args: report.args, result, status: isFailed(result) ? "error" : "done", endedAt: Date.now()}));
    }
    return reports;
}

/** Calls the model, passes after pass, until the reply is finished or something stops it. */
async function driveModel(run: Run) {
    const {conversationId, text, quotes, providerId, apiKey, modelId, modelOptions, started, startedAt, abortController,
        updatedMessages, modelMessages, sentFiles, reply, meter, midRun} = run;
    const {metrics} = meter;
    const model = withRateLimits(getModel(providerId, apiKey, modelId, undefined, modelOptions),
        {conversationId, modelName: formatModelName(modelId)});
    const sloth = providerId === "tampersloth";
    const planBudget = await run.planBudgetReady;
    const settings: AgentSettings = withPlanRunBudget(await run.settingsReady, planBudget);
    let approvalMode = settings.actionApproval;
    run.stopWatchingApproval = onAgentSettingsChange(next => { approvalMode = next.actionApproval; });
    // Stopped by the plan's budget rather than the user's own: the plan-limit notice says so instead of an error line.
    const budgetStopped = () => Boolean(stopReason) && stopReason === runStopReason(settings, metrics.steps);
    const planStopped = () => Boolean(planBudget) && settings.tokenBudget === planBudget && budgetStopped();
    // Every model call of this run, screening included, counts toward that budget.
    const runHeaders = sloth ? {[RUN_HEADER]: crypto.randomUUID()} : undefined;
    const archived = new Set<string>();
    const prepareMessages = createStepMessagePreparer(providerId, archived, modelId);
    let stopReason = "";
    let stepContext = {activeTools: 0, contextChars: 0, recordedAt: startedAt};
    // The screener judges actions against what the user asked for, including a request's earlier turns.
    let userRequest = [...updatedMessages.filter(m => m.role === "user").slice(-3, -1).map(m => `Earlier: ${clip(m.content, 600)}`),
        ...(quotes ?? []).map(q => `Quoted from the page: ${clip(q.text, 400)}`), text].filter(Boolean).join("\n");
    const {tabContext, task, hasCode} = await run.tabContextReady;
    const findAttachment = async (name: string) => {
        // Newest first, since a chat can hold the same file name twice. This message's file may still be on its way to disk.
        const sent = (getSession(conversationId)?.messages ?? []).flatMap(m => m.attachments ?? []).reverse().find(a => a.name === name);
        if (!sent?.id) return null;
        return sentFiles.get(sent.id) ?? await loadAttachment(sent.id).catch(() => null);
    };
    const runtime = createToolRuntime(createAgentTools({conversationId, abortSignal: abortController.signal, findAttachment}), {
        request: text,
        playbooks,
        // A follow-up here is likely about that code, and enabling these mid-run costs a step and the prompt cache.
        extraGroups: hasCode ? ["scripting"] : [],
        safety: {
            conversationId,
            request: () => userRequest,
            mode: () => approvalMode,
            screen: async (instructions, prompt, signal) => (await generateText({
                model, instructions, prompt, abortSignal: signal, maxRetries: 1, headers: runHeaders,
                providerOptions: titleProviderOptions(providerId, modelId),
            })).text,
            onSafety: reply.reportSafety,
            readScript: (path) => readFile(conversationId, path),
        },
        findPrevious: (id) => {
            for (const message of updatedMessages) {
                const call = message.toolCalls?.find(call => call.id === id);
                if (call) return {name: call.name, input: call.args, output: call.result};
            }
        },
        onResult: () => reply.update(m => ({...m, taskState: clip(serialize(runtime.taskState()), 9000)})),
    });
    if (task) void setTaskStatus(conversationId, 'working');

    const providerOptions = agentProviderOptions(providerId,
        getSession(conversationId)?.thinkingLevel ?? settings.thinkingLevel, modelId);
    // Carrying on with a file needs no new reasoning, and reasoning spends the same output limit.
    const carryOnOptions = agentProviderOptions(providerId, "low", modelId);

    // Instructions accept a system message with providerOptions, so
    // Anthropic can cache tools and the trusted system prompt together.
    const systemMessage: ModelMessage = {
        role: "system",
        content: [SYSTEM_PROMPT, runtime.initialGuidance, renderPlaybookIndex(playbooks, loadedPlaybookIds(updatedMessages))].filter(Boolean).join("\n"),
        providerOptions: ANTHROPIC_CACHE_BREAKPOINT,
    };

    const guard = createGuidanceGuard();
    const readQueued = async (at: number) => {
        const queued = await midRun.read(at);
        if (queued) userRequest += queued.map(q => `\nAdded while working: ${clip(q.text, 600)}`).join("");
    };
    let passMessages: ModelMessage[] = [...modelMessages, {role: "user", content: `Current-tab metadata (untrusted page data): ${tabContext}`}];
    const passTotals: UsageRecord[] = [];
    const reportStopped = () => {
        if (planStopped()) {
            setCreditsExhausted(conversationId, {limit: "runBudget", message: "This reply reached your plan's limit for one run. Send a message to continue."});
        } else if (budgetStopped()) {
            // The user's own budget: a setting they chose, so a note with the way to change it, not an error.
            setCreditsExhausted(conversationId, {limit: "userBudget", message: stopReason, budget: settings.tokenBudget});
        } else {
            patchSession(conversationId, {
                error: `${stopReason || `Reached the ${settings.maxSteps}-step limit.`} Work may be incomplete. Send another message to continue.`,
            });
        }
    };
    let cutOffs = 0;
    let fruitlessCutOffs = 0;
    // The next pass's first step picks up after a cut-off.
    let carryingOn = false;
    // A walkthrough that ends in chat text after an observer hiccup gets
    // sent back to the overlay; text is held until a tool call proves it a preamble.
    while (true) {
        const held = createHeldText(reply);
        const result = streamText({
            model,
            instructions: systemMessage,
            messages: passMessages,
            tools: runtime.tools,
            // After a cut-off the SDK would otherwise send the half-written call back as an error,
            // and the model would write it all again. The check after this stream picks it up instead.
            stopWhen: [isStepCount(settings.maxSteps), () => Boolean(stopReason), ({steps}) => steps.at(-1)?.finishReason === "length"],
            abortSignal: abortController.signal,
            headers: runHeaders,
            prepareStep: async ({initialMessages, responseMessages}) => {
                await readQueued(responseMessages.length);
                // Rebuild from the original transcript: v7 otherwise carries
                // compacted projections and cache breakpoints into later steps.
                const messages = [...initialMessages, ...withInjected(responseMessages, midRun.injected)];
                const activeTools = runtime.activeTools();
                const compacted = prepareMessages(messages, activeTools);
                stepContext = {activeTools: activeTools.length, contextChars: serialize(compacted).length, recordedAt: Date.now()};
                const carryOn = (carryingOn && responseMessages.length === 0) || lastStepAppended(responseMessages);
                return {...markCachePrefix({messages: compacted}), activeTools, ...(carryOn ? {providerOptions: carryOnOptions} : {})};
            },
            onStepEnd: ({usage}) => {
                metrics.steps.push({...usageRecord(usage), ...stepContext});
                metrics.tools = runtime.metrics();
                metrics.compactedResults = archived.size;
                metrics.elapsedMs = Math.round(performance.now() - started);
                stopReason = runStopReason(settings, metrics.steps, runtime.repeatedFailure());
                metrics.stopReason = stopReason || undefined;
                reply.update(m => ({...m, runMetrics: meter.current()}));
            },
            providerOptions,
        });

        const cutOff = await showStream(run, result.stream as AsyncIterable<TextStreamPart<ToolSet>>, {
            held, guard, reportStopped,
            onFinishUsage: (usage) => {
                passTotals.push(usageRecord(usage));
                metrics.total = sumUsage(passTotals);
                metrics.elapsedMs = Math.round(performance.now() - started);
                metrics.tools = runtime.metrics();
                reply.update(m => ({...m, runMetrics: meter.current()}));
                console.info("[Tampersloth] run metrics", metrics);
            },
        });

        if (cutOff && !abortController.signal.aborted) {
            held.flush();
            // Done first, so the note can say exactly what is saved.
            const reports = await settleWrites(run, true);
            const {messages, kept, reasoning: worked} = withoutCutOffStep((await result.response).messages);
            const progressed = kept || reports.some(report => report.kind === "saved");
            fruitlessCutOffs = progressed ? 0 : fruitlessCutOffs + 1;
            cutOffs++;
            if (!stopReason && cutOffs <= MAX_CUTOFF_RESUMES && fruitlessCutOffs < MAX_FRUITLESS_CUTOFFS) {
                passMessages = [...passMessages, ...withInjected(messages, midRun.injected),
                    {role: "user", content: cutOffNote(reports, {kept, reasoning: worked})}];
                midRun.injected.length = 0;
                carryingOn = true;
                continue;
            }
            const resumeNote = interruptedNote(reports);
            if (resumeNote) reply.update(m => ({...m, resumeNote}));
            if (stopReason) reportStopped();
            else patchSession(conversationId, {error: `Stopped — the model kept hitting its output token limit.${resumeNote ? " What it wrote is saved." : ""} Send another message to continue.`});
            break;
        }
        if (held.text && !abortController.signal.aborted && !stopReason && guard.resume()) {
            passMessages = [...passMessages, ...withInjected((await result.response).messages, midRun.injected),
                {role: "user", content: GUIDANCE_RESUME_NOTE}];
            midRun.injected.length = 0;
            continue;
        }
        held.flush();
        break;
    }
}

/** Reply text not shown yet, because it may turn out to be a preamble to more guidance. */
function createHeldText(reply: ReplyWriter) {
    let text = "";
    return {
        get text() { return text; },
        hold(more: string) { text += more; },
        flush() { if (text) { reply.appendText(text); text = ""; } },
    };
}

/** Shows one pass of the model's stream in the reply. Returns whether the output limit cut it off. */
async function showStream(run: Run, stream: AsyncIterable<TextStreamPart<ToolSet>>, pass: {
    held: ReturnType<typeof createHeldText>;
    guard: ReturnType<typeof createGuidanceGuard>;
    reportStopped: () => void;
    onFinishUsage: (usage: Parameters<typeof usageRecord>[0]) => void;
}): Promise<boolean> {
    const {conversationId, reply, midRun, writes} = run;
    const {held, guard, reportStopped, onFinishUsage} = pass;
    let cutOff = false;
    // Every provider's reasoning shape (native parts or inline
    // <think> tags) arrives here as the same thinking events.
    const reasoning = createReasoningNormalizer();
    const handleNormalized = (events: NormalizedEvent[]) => {
        for (const event of events) {
            if (event.type === "text-delta") {
                if (guard.holding()) held.hold(event.text);
                else {held.flush(); reply.appendText(event.text);}
            } else {
                reply.applyThinking(event);
            }
        }
    };
    for await (const part of stream) {
        // Every part of the previous step has been shown by the time the next one starts.
        if (part.type === "start-step") {
            midRun.show();
            writes.stepStart();
        }
        handleNormalized(reasoning.push(part));
        if (part.type === "tool-input-start") {
            held.flush();
            writes.start(part.id, part.toolName);
            reply.startToolCall(part.id, part.toolName);
        } else if (part.type === "tool-input-delta") {
            const reason = partialReason(writes.delta(part.id, part.delta));
            if (reason) reply.setToolReason(part.id, reason);
        } else if (part.type === "tool-call") {
            held.flush();
            writes.call(part.toolCallId, part.toolName, part.input, (part as {invalid?: boolean}).invalid);
            reply.setToolInput(part.toolCallId, part.toolName, part.input);
        } else if (part.type === "tool-result") {
            writes.resolved(part.toolCallId);
            guard.observe(part.toolName, part.output);
            reply.finishToolCall(part.toolCallId, part.output, isFailed(part.output) ? "error" : "done");
        } else if (part.type === "error") {
            const rawErr: any = part.error;
            // Out of Sloth credit: the notice above the composer says so and offers the ways on.
            const credits = creditsExhaustedError(rawErr);
            if (credits) {
                setCreditsExhausted(conversationId, credits);
                void refreshAccount();
            }
            const errMsg = streamErrorMessage(rawErr);
            if (!credits) patchSession(conversationId, {error: errMsg});
        } else if (part.type === "finish") {
            // Token accounting for the run. cachedInputTokens near the
            // total input count means the prefix cache is working; near
            // zero means breakpoints aren't landing.
            if (part.totalUsage) onFinishUsage(part.totalUsage);
            // Anything but "stop" means the run was cut short. Without
            // this the message just ends mid-task and looks finished.
            if (part.finishReason === "tool-calls") {
                reportStopped();
            } else if (part.finishReason === "length") {
                cutOff = true;
            } else if (part.finishReason === "content-filter") {
                patchSession(conversationId, {error: "Stopped — the response was blocked by a content filter."});
            }
        } else if (part.type === "tool-error") {
            writes.failed(part.toolCallId);
            reply.finishToolCall(part.toolCallId, (part as any).error, "error");
        }
    }
    handleNormalized(reasoning.flush());
    return cutOff;
}

/** What a stream's error part says, whatever shape the provider gave it. */
function streamErrorMessage(rawErr: any): string {
    let errMsg: string = "Something went wrong";
    if (typeof rawErr === "string") {
        errMsg = rawErr;
    } else if (rawErr instanceof Error) {
        errMsg = rawErr.message || rawErr.name || errMsg;
    } else if (rawErr && typeof rawErr === "object") {
        errMsg =
            rawErr.message ||
            rawErr.error?.message ||
            rawErr.error ||
            (() => {
                try {
                    return JSON.stringify(rawErr);
                } catch {
                    return errMsg;
                }
            })();
        if (typeof errMsg !== "string") errMsg = "Something went wrong";
    }
    return errMsg;
}

/** Ends a run however it went: keeps part-written files, cleans up the tab, and picks up anything still queued. */
async function finishRun(run: Run) {
    const {conversationId, started, abortController, reply, meter, midRun} = run;
    // A stop or a dropped connection part way through a write leaves it for the next message to resume.
    const resumeNote = interruptedNote(await settleWrites(run, false));
    if (resumeNote) reply.update(m => ({...m, resumeNote}));
    run.stopWatchingApproval();
    // Read by the model but stopped before their step began.
    midRun.show();
    // A stopped or failed task can't finish its own tabs: close the disposable ones, keeping retained tabs.
    if (run.failed || abortController.signal.aborted) await finishTaskTabs(conversationId);
    // Tabs still open at a normal end mean the task waits on the user's reply.
    else await setTaskStatus(conversationId, 'waiting');
    // Keep the cursor through idle tool pauses, then remove the run's decorations
    // before handing the tab to the next waiting chat. Cleanup is browser-wide,
    // so it is skipped while another chat still holds a tab.
    runs.delete(conversationId);
    if (holdsTab(conversationId) && !othersHoldTabs(conversationId)) {
        await chrome.runtime.sendMessage({type:'BROWSER_RUN_END'}).catch(()=>{});
    }
    releaseTabs(conversationId);
    // A stopped run never receives "finish", so total it from completed steps,
    // and any reasoning it was in the middle of is over.
    const endedAt = Date.now();
    const stopped = abortController.signal.aborted;
    const {segment} = meter;
    reply.update(m => ({...m, ...(stopped ? {stopped: true} : {}), blocks: closeThinking(m.blocks, endedAt), runMetrics: m.runMetrics
        ? {...m.runMetrics, total: m.runMetrics.total ?? sumUsage(m.runMetrics.steps),
            elapsedMs: segment.step === 0 ? Math.round(performance.now() - started) : endedAt - segment.startedAt} : undefined}));
    patchSession(conversationId, {isLoading: false});
    const waiting = getSession(conversationId)?.queued ?? [];
    if (waiting.length) {
        patchSession(conversationId, {queued: []});
        if (run.failed || stopped) {
            // A stop means stop: what was waiting goes back to the composer instead of starting a run.
            draftFromQueued(conversationId, waiting);
        } else {
            // The run ended without another step to read them: the first starts the next run, which reads the rest at once.
            const [first, ...rest] = waiting;
            void sendMessage(conversationId, first.text, first.model.providerId, first.model.apiKey, first.model.modelId,
                first.pickedElements, first.attachments, first.quotes);
            if (rest.length) updateSession(conversationId, (s) => ({...s, queued: [...rest, ...s.queued]}));
        }
    }
}
