import fs from 'node:fs';
import {z} from 'zod';
import {createLoader} from './load-ts.mjs';

const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/context-baseline.json', import.meta.url), 'utf8'));
const load = createLoader({mocks: {'src/storage/scripts.ts': {}, 'src/storage/codeFiles.ts': {}}});
const raw = load('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'benchmark'});
const {createToolRuntime} = load('src/agent/tools/toolRuntime.ts');
const {compactToolOutput, serialize} = load('src/agent/tools/toolOutput.ts');
const {compactMessages} = load('src/agent/run/contextCompaction.ts');
const prompt = load('src/agent/prompt/systemPrompt.ts').default;
const skills = load('src/agent/prompt/skills.ts').skills;
const previousPreamble = baseline.toolDefinitionChars + baseline.systemPromptChars;
const reduction = (before, after) => `${((1 - after / before) * 100).toFixed(1)}%`;

const cases = [
    ['Read a page', 'Summarize this article'],
    ['Research several pages', 'Browse and search for three alternatives'],
    ['Create a script', 'Create a script to hide the banner'],
    ['Debug a script', 'Debug a broken script'],
    ['Modify a script', 'Modify the existing script'],
];
const results = cases.map(([scenario, request]) => {
    const runtime = createToolRuntime(raw, {request, findPrevious: () => undefined});
    const definitionChars = runtime.activeTools().reduce((sum, name) => {
        const t = runtime.tools[name];
        return sum + JSON.stringify({name, description: t.description, parameters: z.toJSONSchema(t.inputSchema, {io: 'input'})}).length;
    }, 0);
    const chars = definitionChars + prompt.length + runtime.initialGuidance.length;
    return {scenario, tools: runtime.activeTools().length, beforeChars: previousPreamble, afterChars: chars, reduction: reduction(previousPreamble, chars)};
});

// Fixed 20-step replay isolates history growth; it does not simulate model choices,
// task quality, pricing, image tokenization, or cache-hit behavior.
const oldMessages = [{role: 'user', content: 'Compare these pages and retain source URLs.'}];
const newMessages = [...oldMessages];
const archived = new Set();
let oldTotal = 0, newTotal = 0;
for (let i = 0; i < 20; i++) {
    oldTotal += previousPreamble + serialize(oldMessages).length;
    newTotal += results[0].afterChars + serialize(compactMessages(newMessages, archived)).length;
    const call = {role: 'assistant', content: [{type: 'tool-call', toolCallId: `read-${i}`, toolName: 'getPageText', input: {selector: 'main'}}]};
    const output = {url: `https://example.com/${i}`, text: 'a'.repeat(10000)};
    oldMessages.push(call, {role: 'tool', content: [{type: 'tool-result', toolCallId: `read-${i}`, toolName: 'getPageText', output: {type: 'json', value: output}}]});
    const projected = compactToolOutput({...output, text: output.text.slice(0, 3000), nextOffset: 3000, truncated: true}, `read-${i}`);
    newMessages.push(call, {role: 'tool', content: [{type: 'tool-result', toolCallId: `read-${i}`, toolName: 'getPageText', output: {type: 'text', value: serialize(projected)}}]});
}
// ── Script session replay ──────────────────────────────────
// Real file and script tools on in-memory storage, through the runtime's projections and the
// run's compaction. The calls are fixed (a model would choose its own), so this measures what the
// tools send and keep in history, not task quality. A step the tools make unnecessary is skipped.

function memoryChrome() {
    const store = {};
    const pick = keys => keys == null ? {...store}
        : Object.fromEntries([keys].flat().filter(k => k in store).map(k => [k, store[k]]));
    return {
        store,
        chrome: {
            storage: {
                local: {
                    get: async keys => pick(keys),
                    set: async values => { Object.assign(store, structuredClone(values)); },
                    remove: async keys => { for (const k of [keys].flat()) delete store[k]; },
                    getKeys: async () => Object.keys(store),
                },
                onChanged: {addListener() {}, removeListener() {}},
            },
            runtime: {sendMessage: async message => message.type === 'EXECUTE_SCRIPT' ? {result: 'Hid 3 banners'} : {ok: true}},
            tabs: {
                get: async () => ({id: 7, url: 'https://example.com/', title: 'Example', status: 'complete'}),
                reload: async () => {},
                onUpdated: {addListener: listener => setTimeout(() => listener(7, {status: 'complete'}), 0), removeListener() {}},
            },
        },
    };
}

const sessionLines = ['function hideBanners() {', '  // ── Banners ──'];
for (let i = 0; sessionLines.length < 296; i++) {
    sessionLines.push(
        `  const promo${i} = document.querySelector('[data-slot="promo-${i}"]');`,
        `  if (promo${i}) promo${i}.style.setProperty("display", "none", "important");`,
        `  console.debug(\`promo ${i}: \${promo${i} ? "hidden" : "absent"}\`);`,
    );
}
sessionLines.push('  return "Hid banners";', '}');
const pageCheck = {found: true, selector: '[data-slot="promo-3"]', computed: {display: 'none'}, text: 'x'.repeat(900)};

async function scriptSession(request, preamble, plan, setup) {
    const {chrome} = memoryChrome();
    const sessionLoad = createLoader({globals: {chrome, structuredClone, TextEncoder, TextDecoder}});
    const tools = sessionLoad('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'chat'});
    await setup?.(sessionLoad);
    const runtime = sessionLoad('src/agent/tools/toolRuntime.ts').createToolRuntime(tools, {request, findPrevious: () => undefined});
    const {compactMessages: compact} = sessionLoad('src/agent/run/contextCompaction.ts');
    const supports = (name, field) => field in (runtime.tools[name]?.inputSchema?.shape ?? {});
    const messages = [{role: 'user', content: request}];
    const archivedIds = new Set();
    const stats = {steps: 0, sentChars: 0, historyChars: 0, codeReadChars: 0, codeWrittenChars: 0};
    const send = () => {
        const history = serialize(compact(messages, archivedIds)).length;
        stats.steps++;
        stats.historyChars += history;
        stats.sentChars += preamble + history;
    };
    for (const [index, step] of plan.entries()) {
        const call = typeof step === 'function' ? step({supports}) : step;
        if (!call) continue;
        send();
        const id = `call-${index}`;
        let output;
        if (call.synthetic) {
            output = {type: 'json', value: call.synthetic};
        } else {
            const definition = runtime.tools[call.name];
            const parsed = definition.inputSchema.parse(call.input);
            const raw = await definition.execute(parsed, {toolCallId: id, messages: [], abortSignal: new AbortController().signal});
            if (raw?.error || raw?.success === false) throw new Error(`${call.name} failed in the replay: ${raw.error}`);
            output = await definition.toModelOutput({toolCallId: id, input: parsed, output: raw});
            if (['viewCodeFiles', 'openScript'].includes(call.name)) stats.codeReadChars += serialize(output.value).length;
        }
        if (['createFileTool', 'appendToFile', 'strReplaceTool', 'replaceLines'].includes(call.name)) stats.codeWrittenChars += serialize(call.input).length;
        messages.push({role: 'assistant', content: [{type: 'tool-call', toolCallId: id, toolName: call.name, input: call.input}]},
            {role: 'tool', content: [{type: 'tool-result', toolCallId: id, toolName: call.name, output}]});
    }
    send(); // The final reply.
    return stats;
}

const scriptPath = 'scripts/hide-banners.js';
const check = {name: 'getElementDetails', synthetic: pageCheck};
const saveAndReload = (input) => [
    ({supports}) => ({name: 'saveScript', input: {...input, ...(supports('saveScript', 'reload') ? {reload: true} : {})}}),
    ({supports}) => supports('saveScript', 'reload') ? null : {name: 'reloadPage', synthetic: {success: true, url: 'https://example.com/', title: 'Example', timeMs: 900}},
];
const createRun = await scriptSession('Create a script to hide the banner', results[2].afterChars, [
    // The whole file in one call; it used to go in pieces of at most 150 lines.
    {name: 'createFileTool', input: {path: scriptPath, file_text: sessionLines.join('\n')}},
    {name: 'executeContentScript', input: {path: scriptPath}},
    check,
    {name: 'viewCodeFiles', input: {path: scriptPath, query: 'promo-12"'}},
    {name: 'strReplaceTool', input: {path: scriptPath, old_str: `"[data-slot="promo-12"]"`.slice(1, -1), new_str: `[data-slot="promo-12"], .promo-12`}},
    {name: 'viewCodeFiles', input: {path: scriptPath, start_line: 140}},
    {name: 'replaceLines', input: {path: scriptPath, start_line: 141, end_line: 142, first_line: sessionLines[140], new_text: `${sessionLines[140]}\n  // keep layout stable`}},
    {name: 'executeContentScript', input: {path: scriptPath}},
    check,
    ...saveAndReload({path: scriptPath, name: 'Hide banners', scriptDescription: 'Hides promo banners', urlMatchPattern: 'https://example.com/*', runAt: 'document_end'}),
    check, check, check,
]);
let savedId = '';
const modifyRun = await scriptSession('Modify the existing script', results[4].afterChars, [
    {name: 'openScript', input: {scriptId: 'saved-1'}},
    {name: 'viewCodeFiles', input: {path: 'scripts/hide-banners.js', query: 'promo-40"'}},
    {name: 'strReplaceTool', input: {path: 'scripts/hide-banners.js', old_str: `'[data-slot="promo-40"]'`, new_str: `'[data-slot="promo-40"], footer .promo'`}},
    {name: 'executeContentScript', input: {path: 'scripts/hide-banners.js'}},
    check,
    ...saveAndReload({path: 'scripts/hide-banners.js', scriptId: 'saved-1'}),
    check,
], async sessionLoad => {
    // A script saved in another chat, so its code has to be opened here first.
    await sessionLoad('src/storage/scripts.ts').saveScript({id: 'saved-1', conversationId: 'other', name: 'Hide banners', description: 'Hides promo banners',
        code: sessionLines.join('\n'), urlMatchPattern: 'https://example.com/*', status: 'active', runAt: 'document_end'});
    savedId = 'saved-1';
});

console.log(JSON.stringify({measurement: 'Serialized characters; not live provider token measurements',
    preambles: results,
    skills: {beforeChars: baseline.skillContentChars, afterChars: Object.values(skills).reduce((n, s) => n + s.content.length, 0)},
    fixedReplay: {steps: 20, beforeChars: oldTotal, afterChars: newTotal, reduction: reduction(oldTotal, newTotal), compactedResults: archived.size},
    scriptSession: {scriptLines: sessionLines.length, scriptChars: sessionLines.join('\n').length, savedScript: savedId,
        create: {...createRun, before: baseline.scriptSession?.create}, modify: {...modifyRun, before: baseline.scriptSession?.modify}},
}, null, 2));
