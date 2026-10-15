import test from 'node:test';
import assert from 'node:assert/strict';
import {tool, streamText, generateText, isStepCount} from 'ai';
import {createAnthropic} from '@ai-sdk/anthropic';
import {MockLanguageModelV4} from 'ai/test';
import {z} from 'zod';
import {createLoader, invoke, plain} from './load-ts.mjs';

function fixture({logs = [], text = 'content', files = new Map(), scripts = []} = {}) {
    const root = {tagName: 'MAIN', innerText: text};
    const storage = {
        loadScripts: async () => scripts, loadScriptsByConversation: async () => scripts,
        readFile: async (_, path) => files.get(path) ?? null,
        writeFile: async (_, path, content) => files.set(path, content),
    };
    const load = createLoader({mocks: {'./storage': storage}, globals: {
        document: {title: 'Fixture', body: root, querySelector: () => root},
        location: {href: 'https://example.com/article'},
        chrome: {runtime: {sendMessage: async () => ({logs, ok: true})},
            scripting: {executeScript: async ({func, args, target}) => {
                assert.equal(target.tabId, 7);
                return [{result: func(...args)}];
            }}},
    }});
    return {load, files, tools: load('src/chat/lib/tools.ts').createAgentTools({conversationId: 'test'})};
}

test('concise text defaults to 3000 characters and paginates without gaps', async () => {
    const text = '0123456789'.repeat(1500);
    const {tools} = fixture({text});
    const first = (await invoke(tools, 'getPageText')).output;
    assert.equal(first.text.length, 3000);
    assert.equal(first.nextOffset, 3000);
    const next = (await invoke(tools, 'getPageText', {offset: first.nextOffset})).output;
    assert.equal(first.text + next.text, text.slice(0, 6000));
    assert.equal((await invoke(tools, 'getPageText', {responseFormat: 'detailed'})).output.text.length, 10000);
    assert.throws(() => tools.getPageText.inputSchema.parse({maxLength: 1000000}));
    assert.throws(() => tools.getPageText.inputSchema.parse({offset: -1}));
});

test('screenshots in a parallel tool batch follow preceding page changes while independent reads remain parallel', async () => {
    const {load, tools} = fixture(), order = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    tools.clickElement.execute = async () => { order.push('click-start'); await gate; order.push('click-end'); return {ok: true}; };
    tools.takeScreenshot.execute = async () => { order.push('screenshot'); return {screenshot: 'data:image/jpeg;base64,YQ=='}; };
    tools.getCurrentTab.execute = async () => { order.push('read'); return {tabId: 7}; };
    const runtime = load('src/chat/lib/toolRuntime.ts').createToolRuntime(tools, {request: 'click and screenshot', findPrevious: () => undefined});
    const click = invoke(runtime.tools, 'clickElement', {selector: '#send'});
    const screenshot = invoke(runtime.tools, 'takeScreenshot');
    await invoke(runtime.tools, 'getCurrentTab');
    assert.ok(order.includes('click-start'));
    assert.ok(order.includes('read'));
    assert.ok(!order.includes('screenshot'));
    release();
    await Promise.all([click, screenshot]);
    assert.ok(order.indexOf('click-end') < order.indexOf('screenshot'));
});

test('aborting a queued screenshot releases its slot without capturing or blocking later calls', async () => {
    const {load, tools} = fixture();
    let release, captures = 0;
    const gate = new Promise(resolve => { release = resolve; });
    tools.clickElement.execute = async () => { await gate; return {ok: true}; };
    tools.takeScreenshot.execute = async () => { captures++; return {screenshot: 'data:image/jpeg;base64,YQ=='}; };
    const runtime = load('src/chat/lib/toolRuntime.ts').createToolRuntime(tools, {request: 'click and screenshot', findPrevious: () => undefined});
    const click = invoke(runtime.tools, 'clickElement', {selector: '#send'});
    const controller = new AbortController();
    const screenshot = runtime.tools.takeScreenshot.execute({detail: 'standard'}, {toolCallId: 'aborted-shot', messages: [], abortSignal: controller.signal});
    const rejection = assert.rejects(screenshot, /Aborted/);
    controller.abort(); release();
    await Promise.all([click, rejection]);
    assert.equal(captures, 0);
    await invoke(runtime.tools, 'takeScreenshot');
    assert.equal(captures, 1);
});

test('console cap survives a full severe-log allocation', async () => {
    const logs = [...Array.from({length: 50}, () => ({type: 'error', args: ['failure']})),
        ...Array.from({length: 200}, () => ({type: 'log', args: ['noise']}))];
    const {tools} = fixture({logs});
    const result = (await invoke(tools, 'getDebugInfo', {sources: ['console'], responseFormat: 'detailed'})).output.console;
    assert.equal(result.logs.length, 50);
    assert.equal(result.omitted, 200);
    assert.ok(result.logs.every(log => log.type === 'error'));
});

test('concise saved-script listings preserve actionable IDs and patterns', async () => {
    const {tools} = fixture({scripts: [{id: 'script-1', name: 'Hide banner', status: 'active', urlMatchPattern: 'https://example.com/*'}]});
    const result = (await invoke(tools, 'listScripts')).output;
    assert.equal(result.scripts[0].id, 'script-1');
    assert.equal(result.scripts[0].urlPattern, 'https://example.com/*');
});

test('batched edits are atomic and preserve literal replacement dollar characters', async () => {
    const {tools, files} = fixture({files: new Map([['scripts/test.js', 'alpha beta']])});
    const failure = (await invoke(tools, 'strReplaceTool', {path: 'scripts/test.js', edits: [
        {old_str: 'alpha', new_str: 'changed'}, {old_str: 'missing', new_str: 'nope'},
    ]})).output;
    assert.ok(failure.error);
    assert.equal(files.get('scripts/test.js'), 'alpha beta');
    const result = (await invoke(tools, 'strReplaceTool', {path: 'scripts/test.js', edits: [
        {old_str: 'alpha', new_str: '$&'}, {old_str: 'beta', new_str: '$1'},
    ]})).output;
    assert.equal(result.replaced, 2);
    assert.equal(files.get('scripts/test.js'), '$& $1');
    assert.ok((await invoke(tools, 'strReplaceTool', {path: 'scripts/test.js', old_str: '$1', edits: [{old_str: '$&', new_str: ''}]})).output.error);
});

test('output projection caps large data while preserving errors and UI payloads', async () => {
    const {load, tools} = fixture();
    const {createToolRuntime} = load('src/chat/lib/toolRuntime.ts');
    const payload = {error: 'Failed to update', url: 'https://example.com', data: 'x'.repeat(50000)};
    tools.getCurrentTab.execute = async () => payload;
    const runtime = createToolRuntime(tools, {request: '', findPrevious: () => undefined});
    const result = await invoke(runtime.tools, 'getCurrentTab', {}, 'large');
    assert.equal(result.output, payload);
    const projected = JSON.parse(result.projected.value);
    assert.equal(projected.error, payload.error);
    assert.equal(projected.url, payload.url);
    assert.ok(result.projected.value.length <= 6000);
    const recovered = (await invoke(runtime.tools, 'readToolResult', {resultId: 'large', offset: 8000})).output;
    assert.equal(recovered.text, JSON.stringify(payload).slice(8000, 11000));
    assert.equal(runtime.metrics()[0].modelOutputChars, JSON.stringify(result.projected).length);
    assert.equal(runtime.metrics()[0].modelOutputTokens, Math.ceil(result.projected.value.length / 4));
    assert.equal(runtime.metrics()[0].inputTokens, 1);
    assert.equal(runtime.metrics()[0].id, 'large');
});

test('per-call token estimates fall back to characters for older records', async () => {
    const {load} = fixture();
    const {toolCallTokens, estimateImageTokens} = load('src/chat/lib/efficiency.ts');
    const current = toolCallTokens({name: 'getPageText', inputChars: 40, outputChars: 0, modelOutputChars: 0, inputTokens: 10, modelOutputTokens: 700});
    assert.equal(current.input, 10);
    assert.equal(current.output, 700);
    const older = toolCallTokens({name: 'clickElement', inputChars: 80, outputChars: 0, modelOutputChars: 400});
    assert.equal(older.input, 20);
    assert.equal(older.output, 100);
    assert.equal(estimateImageTokens({width: 750, height: 100}), 100);
    assert.equal(estimateImageTokens({width: 1280, height: 4000}), 1600);
});

test('tools expand monotonically and group guidance is sent only once', async () => {
    const {load, tools} = fixture();
    const runtime = load('src/chat/lib/toolRuntime.ts').createToolRuntime(tools, {request: 'Summarize this article', findPrevious: () => undefined});
    assert.equal(runtime.activeTools().length, 12);
    assert.ok(runtime.activeTools().includes('annotatePage'));
    assert.ok(runtime.activeTools().includes('waitForUserAction'));
    assert.ok(runtime.activeTools().includes('wait'));
    assert.ok(!runtime.activeTools().includes('saveScript'));
    const first = (await invoke(runtime.tools, 'enableTools', {groups: ['scripting']})).output;
    assert.ok(first.guidance[0].includes('named function'));
    assert.ok(runtime.activeTools().includes('saveScript'));
    const count = runtime.activeTools().length;
    const second = (await invoke(runtime.tools, 'enableTools', {groups: ['scripting']})).output;
    assert.equal(second.guidance.length, 0);
    assert.equal(runtime.activeTools().length, count);
});

test('identical failing calls are detected despite different UI labels', async () => {
    const {load, tools} = fixture();
    tools.getCurrentTab.execute = async () => ({error: 'Tab gone'});
    const runtime = load('src/chat/lib/toolRuntime.ts').createToolRuntime(tools, {request: '', findPrevious: () => undefined});
    for (let i = 0; i < 3; i++) await invoke(runtime.tools, 'getCurrentTab', {description: 'attempt ' + i});
    assert.match(runtime.repeatedFailure(), /failed three times/);
    assert.equal(runtime.metrics().filter(metric => metric.repeated).length, 2);
});

test('navigate/read waits for navigation, then reads exactly once', async () => {
    const {load, tools} = fixture();
    const sequence = [];
    tools.navigateTo.execute = async () => { sequence.push('navigate'); return {success: true, finalUrl: 'https://example.com', waitForSelector: {found: true}}; };
    tools.getPageText.execute = async input => { sequence.push('read'); assert.equal(input.selector, 'main'); return {text: 'Done'}; };
    const runtime = load('src/chat/lib/toolRuntime.ts').createToolRuntime(tools, {request: '', findPrevious: () => undefined});
    const result = await invoke(runtime.tools, 'navigateTo', {url: 'https://example.com', readText: true, readSelector: 'main'});
    assert.deepEqual(sequence, ['navigate', 'read']);
    assert.equal(result.output.page.text, 'Done');
    tools.navigateTo.execute = async () => ({success: true, waitForSelector: {found: false}});
    const failedWait = load('src/chat/lib/toolRuntime.ts').createToolRuntime(tools, {request: '', findPrevious: () => undefined});
    await invoke(failedWait.tools, 'navigateTo', {url: 'https://example.com', readText: true});
    assert.equal(sequence.length, 2);
});

test('archive retrieval works across turns and restores screenshots as images', async () => {
    const {load, tools} = fixture();
    const runtime = load('src/chat/lib/toolRuntime.ts').createToolRuntime(tools, {request: '', findPrevious: id => id === 'old-image'
        ? {name: 'takeScreenshot', input: {}, output: {screenshot: 'data:image/jpeg;base64,YQ=='}} : undefined});
    const result = await invoke(runtime.tools, 'readToolResult', {resultId: 'old-image'});
    assert.equal(result.projected.type, 'content');
    assert.equal(result.projected.value[0].type, 'file');
    assert.equal(result.projected.value[0].mediaType, 'image/jpeg');
    assert.deepEqual(plain(result.projected.value[0].data), {type: 'data', data: 'YQ=='});
    assert.ok((await invoke(runtime.tools, 'readToolResult', {resultId: 'missing'})).output.error);
});

test('context compaction preserves pair IDs, reasoning metadata, approvals and recent results', () => {
    const {compactMessages} = createLoader()('src/chat/lib/efficiency.ts');
    const messages = [{role: 'user', content: 'Do not purchase anything without asking.'}];
    for (let i = 0; i < 10; i++) {
        messages.push({role: 'assistant', content: [
            {type: 'reasoning', text: 'reasoning', providerOptions: {anthropic: {signature: 'signed'}}},
            {type: 'tool-call', toolCallId: 't' + i, toolName: 'getPageText', input: {selector: 'main'}},
        ]});
        messages.push({role: 'tool', content: [{type: 'tool-result', toolCallId: 't' + i, toolName: 'getPageText', output: {
            type: 'text', value: JSON.stringify({url: 'https://example.com/' + i, text: 'x'.repeat(6000)}),
        }}]});
    }
    messages.push({role: 'tool', content: [{type: 'tool-result', toolCallId: 'approval', toolName: 'askUser', output: {type: 'json', value: {answer: 'Do not submit'}}}]});
    const archived = new Set();
    const compacted = compactMessages(messages, archived);
    assert.equal(compacted[0], messages[0]);
    for (let i = 1; i < 20; i += 2) assert.equal(compacted[i], messages[i]);
    assert.deepEqual(plain(compacted.at(-1)), messages.at(-1));
    assert.deepEqual(plain(compacted.at(-2)), messages.at(-2));
    assert.ok(JSON.stringify(compacted).length < JSON.stringify(messages).length / 2);
    assert.equal(compacted[2].content[0].toolCallId, 't0');
    assert.equal(JSON.parse(compacted[2].content[0].output.value).url, 'https://example.com/0');
    assert.deepEqual(plain(compactMessages(messages, archived)), plain(compacted));
});

test('Claude drops earlier thinking on tool changes and never resurrects it', () => {
    const {createStepMessagePreparer} = createLoader()('src/chat/lib/efficiency.ts');
    const prepare = createStepMessagePreparer('anthropic', new Set());
    const initial = [{role: 'user', content: 'Send the approved draft'}];
    const thinking = {type: 'reasoning', text: 'Plan', providerOptions: {anthropic: {signature: 'signed'}}};
    const redacted = {type: 'reasoning', text: '', providerOptions: {anthropic: {redactedData: 'hidden'}}};
    const call = {type: 'tool-call', toolCallId: 'enable', toolName: 'enableTools', input: {groups: ['browsing']}};
    const result = {role: 'tool', content: [{type: 'tool-result', toolCallId: 'enable', toolName: 'enableTools',
        output: {type: 'json', value: {success: true}}}]};
    prepare(initial, ['enableTools']);
    const history = [...initial, {role: 'assistant', content: [thinking, redacted, call]}, result];
    assert.deepEqual(plain(prepare(history, ['enableTools'])), history);
    const changed = prepare(history, ['enableTools', 'clickElement']);
    assert.deepEqual(plain(changed[1].content), [call]);
    assert.deepEqual(plain(changed[2]), result);
    assert.deepEqual(history[1].content, [thinking, redacted, call]);
    const next = [...history, {role: 'assistant', content: [thinking, {type: 'text', text: 'New plan'}]}];
    const stable = prepare(next, ['enableTools', 'clickElement']);
    assert.deepEqual(plain(stable[1].content), [call]);
    assert.equal(stable.at(-1), next.at(-1));
    const expanded = prepare(next, ['enableTools', 'clickElement', 'typeText']);
    assert.deepEqual(plain(expanded.at(-1).content), [{type: 'text', text: 'New plan'}]);
    assert.deepEqual(plain(prepare(next, ['enableTools', 'clickElement', 'typeText'])), plain(expanded));
});

test('Claude compaction removes invalid thinking, empty turns, and preserves approvals', () => {
    const {createStepMessagePreparer} = createLoader()('src/chat/lib/efficiency.ts');
    const archived = new Set();
    const prepare = createStepMessagePreparer('anthropic', archived);
    const history = [{role: 'user', content: 'Send only if approved'}];
    prepare(history, ['getPageText', 'askUser']);
    for (let i = 0; i < 10; i++) {
        history.push({role: 'assistant', content: [
            {type: 'reasoning', text: 'Plan', providerOptions: {anthropic: {signature: 's' + i}}},
            {type: 'tool-call', toolCallId: 't' + i, toolName: 'getPageText', input: {}},
        ]}, {role: 'tool', content: [{type: 'tool-result', toolCallId: 't' + i, toolName: 'getPageText',
            output: {type: 'text', value: 'x'.repeat(6000)}}]});
    }
    const approval = {role: 'tool', content: [{type: 'tool-result', toolCallId: 'approve', toolName: 'askUser',
        output: {type: 'json', value: {answer: 'Yes, send as drafted'}}}]};
    history.push(approval, {role: 'assistant', content: [
        {type: 'reasoning', text: '', providerOptions: {anthropic: {redactedData: 'secret'}}},
    ]});
    const compacted = prepare(history, ['getPageText', 'askUser']);
    assert.ok(archived.size > 0);
    assert.ok(compacted.filter(m => m.role === 'assistant').every(m => m.content.every(p => p.type !== 'reasoning')));
    assert.deepEqual(plain(compacted.at(-1)), approval);
    assert.equal(compacted[1].content[0].toolCallId, 't0');
    assert.deepEqual(plain(prepare(history, ['getPageText', 'askUser'])), plain(compacted));
    const fresh = {role: 'assistant', content: [{type: 'reasoning', text: 'Fresh', providerOptions: {anthropic: {signature: 'new'}}}]};
    assert.equal(prepare([...history, fresh], ['getPageText', 'askUser']).at(-1), fresh);
});

test('tool changes keep reasoning for other providers and preparation resets per run', () => {
    const {createStepMessagePreparer} = createLoader()('src/chat/lib/efficiency.ts');
    const history = [{role: 'assistant', content: [{type: 'reasoning', text: 'Plan', providerOptions: {deepseek: {signature: 's'}}}]}];
    for (const provider of ['openai', 'google', 'vertex', 'deepseek']) {
        const prepare = createStepMessagePreparer(provider, new Set());
        prepare(history, ['getPageText']);
        assert.equal(prepare(history, ['getPageText', 'clickElement'])[0], history[0]);
    }
    const firstRun = createStepMessagePreparer('anthropic', new Set());
    firstRun(history, ['getPageText']);
    assert.equal(firstRun(history, ['getPageText', 'clickElement']).length, 0);
    assert.equal(createStepMessagePreparer('anthropic', new Set())(history, ['getPageText'])[0], history[0]);
});

test('Anthropic SDK sends valid history after deferred tool activation', async () => {
    const load = createLoader();
    const raw = {
        getPageText: tool({inputSchema: z.object({}), execute: async () => ({text: 'Page'})}),
        listScripts: tool({inputSchema: z.object({}), execute: async () => ({scripts: []})}),
    };
    const runtime = load('src/chat/lib/toolRuntime.ts').createToolRuntime(raw, {request: '', findPrevious: () => undefined});
    const prepare = load('src/chat/lib/efficiency.ts').createStepMessagePreparer('anthropic', new Set());
    const buildTabMessages = load('src/chat/lib/tabContext.ts').createTabContextMessageBuilder();
    const requests = [];
    const model = createAnthropic({apiKey: 'test-key', fetch: async (_url, init) => {
        const body = JSON.parse(init.body);
        const step = requests.length;
        requests.push(body);
        const reasoning = [{type: 'thinking', thinking: 'Plan ' + step, signature: 'signed-' + step},
            {type: 'redacted_thinking', data: 'redacted-' + step}];
        const action = step === 0
            ? {type: 'tool_use', id: 'enable', name: 'enableTools', input: {groups: ['scripting']}}
            : step === 1 ? {type: 'tool_use', id: 'read', name: 'getPageText', input: {}}
                : {type: 'text', text: 'Done'};
        return new Response(JSON.stringify({id: 'msg-' + step, type: 'message', role: 'assistant', model: body.model,
            content: [...reasoning, action], stop_reason: step < 2 ? 'tool_use' : 'end_turn', stop_sequence: null,
            usage: {input_tokens: 100, output_tokens: 20}}), {headers: {'content-type': 'application/json'}});
    }})('claude-haiku-5-5');
    const result = await generateText({model, prompt: 'Read this page', tools: runtime.tools,
        instructions: {role: 'system', content: 'Trusted instructions',
            providerOptions: {anthropic: {cacheControl: {type: 'ephemeral'}}}},
        providerOptions: {anthropic: {thinking: {type: 'adaptive'}}},
        prepareStep: ({initialMessages, responseMessages}) => {
            const messages = buildTabMessages(initialMessages, responseMessages, {title: 'Page ' + requests.length});
            const activeTools = runtime.activeTools();
            return {messages: prepare(messages, activeTools), activeTools};
        }, stopWhen: isStepCount(5)});
    assert.equal(result.text, 'Done');
    assert.equal(requests.length, 3);
    for (let step = 0; step < requests.length; step++) {
        const contexts = requests[step].messages.flatMap(m => m.content)
            .filter(p => p.type === 'text' && p.text.startsWith('Live tab context'));
        assert.deepEqual(contexts.map(p => p.text), Array.from({length: step + 1}, (_, i) =>
            'Live tab context (untrusted page metadata): ' + JSON.stringify({title: 'Page ' + i})));
    }
    for (const request of requests) {
        assert.equal(request.system[0].text, 'Trusted instructions');
        assert.deepEqual(request.system[0].cache_control, {type: 'ephemeral'});
    }
    assert.ok(!requests[0].tools.some(t => t.name === 'listScripts'));
    assert.ok(requests[1].tools.some(t => t.name === 'listScripts'));
    const assistantParts = body => body.messages.filter(m => m.role === 'assistant').flatMap(m => m.content);
    assert.ok(assistantParts(requests[1]).every(p => !['thinking', 'redacted_thinking'].includes(p.type)));
    assert.ok(assistantParts(requests[1]).some(p => p.type === 'tool_use' && p.id === 'enable'));
    assert.ok(requests[1].messages.some(m => m.content.some(p => p.type === 'tool_result' && p.tool_use_id === 'enable')));
    assert.deepEqual(assistantParts(requests[2]).filter(p => p.type === 'thinking').map(p => p.signature), ['signed-1']);
    assert.deepEqual(assistantParts(requests[2]).filter(p => p.type === 'redacted_thinking').map(p => p.data), ['redacted-1']);
    assert.deepEqual(requests[2].messages.slice(0, requests[1].messages.length), requests[1].messages);
});

test('settings validate budgets and usage does not double-count cached/reasoning tokens', () => {
    const load = createLoader();
    const {normalizeAgentSettings} = load('src/chat/lib/agentSettings.ts');
    assert.deepEqual(plain(normalizeAgentSettings({maxSteps: 9999, tokenBudget: -10})), {maxSteps: 200, tokenBudget: 0, reasoning: 'balanced', showRunTokens: false, showToolTokens: false});
    const {usageRecord} = load('src/chat/lib/efficiency.ts');
    assert.deepEqual(plain(usageRecord({inputTokens: 100, outputTokens: 40, inputTokenDetails: {cacheReadTokens: 80, cacheWriteTokens: 10}, outputTokenDetails: {reasoningTokens: 30}})),
        {input: 100, output: 40, cacheRead: 80, cacheWrite: 10, reasoning: 30});
});

test('stopped runs total completed steps and token display toggles persist', () => {
    const load = createLoader();
    const {sumUsage} = load('src/chat/lib/efficiency.ts');
    assert.equal(sumUsage([]), undefined);
    assert.deepEqual(plain(sumUsage([{input: 100, output: 20, cacheRead: 50}, {input: 200, output: 30}])),
        {input: 300, output: 50, cacheRead: 50});
    const {normalizeAgentSettings} = load('src/chat/lib/agentSettings.ts');
    const shown = normalizeAgentSettings({showRunTokens: true, showToolTokens: true});
    assert.equal(shown.showRunTokens, true);
    assert.equal(shown.showToolTokens, true);
});

test('output budgets include JSON escaping and oversized structured errors', () => {
    const {compactToolOutput} = createLoader()('src/chat/lib/efficiency.ts');
    const payload = Object.fromEntries(['error', 'url', 'finalUrl', 'newUrl', 'title', 'scriptId', 'path', 'sourcePath', 'status', 'urlMatchPattern', 'runAt']
        .map(key => [key, '\\"\n\t'.repeat(5000)]));
    payload.error = {stack: '\\"\n'.repeat(10000)};
    const result = compactToolOutput(payload, 'escaped');
    assert.ok(JSON.stringify(result).length <= 6000);
    assert.equal(result.resultId, 'escaped');
    assert.ok(result.error);
});

test('archive keeps user decisions after many later observations', async () => {
    const {load, tools} = fixture();
    tools.askUser.execute = async () => ({answer: {label: 'This page only', custom: false}});
    tools.getCurrentTab.execute = async () => ({url: 'https://example.com'});
    const runtime = load('src/chat/lib/toolRuntime.ts').createToolRuntime(tools, {request: '', findPrevious: () => undefined});
    await invoke(runtime.tools, 'askUser', {question: 'Where should this run?', options: [{label: 'This page only'}, {label: 'All pages'}]}, 'decision');
    for (let i = 0; i < 15; i++) await invoke(runtime.tools, 'getCurrentTab');
    const decision = runtime.taskState().find(entry => entry.resultId === 'decision');
    assert.equal(decision.question, 'Where should this run?');
    assert.match(decision.preview, /This page only/);
});

test('virtual file listings return paths that readFile can consume', async () => {
    const load = createLoader({globals: {chrome: {storage: {local: {
        getKeys: async () => ['ts_file:chat/scripts/a.js', 'ts_file:other/scripts/b.js', 'ts_conversations'],
        get: async () => { throw new Error('Listings must not load stored payloads'); },
    }}}}});
    const {listFiles} = load('src/chat/lib/storage.ts');
    assert.deepEqual(plain(await listFiles('chat', 'scripts/')), ['scripts/a.js']);
});

test('escaped archive pages reconstruct the original without nested truncation stubs', async () => {
    const {load, tools} = fixture();
    const original = '\\"\n\t'.repeat(3000);
    const runtime = load('src/chat/lib/toolRuntime.ts').createToolRuntime(tools, {request: '', findPrevious: () => ({name: 'executeContentScript', input: {}, output: original})});
    let offset = 0, reconstructed = '';
    do {
        const result = await invoke(runtime.tools, 'readToolResult', {resultId: 'old', offset, length: 5000});
        assert.ok(result.projected.value.length <= 6000);
        assert.equal(JSON.parse(result.projected.value).archived, undefined);
        reconstructed += result.output.text;
        offset = result.output.nextOffset;
    } while (offset !== undefined);
    assert.equal(reconstructed, original);
});

test('aborted calls never execute browser actions', async () => {
    const {load, tools} = fixture();
    let executed = false;
    tools.getCurrentTab.execute = async () => { executed = true; };
    const runtime = load('src/chat/lib/toolRuntime.ts').createToolRuntime(tools, {request: '', findPrevious: () => undefined});
    const controller = new AbortController(); controller.abort();
    await assert.rejects(runtime.tools.getCurrentTab.execute({}, {toolCallId: 'cancelled', messages: [], abortSignal: controller.signal}), {name: 'AbortError'});
    assert.equal(executed, false);
});

test('SDK stops at a measured run budget without launching another step', async () => {
    const load = createLoader();
    const {runStopReason, DEFAULT_AGENT_SETTINGS} = load('src/chat/lib/agentSettings.ts');
    const {usageRecord} = load('src/chat/lib/efficiency.ts');
    const settings = {...DEFAULT_AGENT_SETTINGS, tokenBudget: 200};
    const steps = [];
    let reason = '', calls = 0;
    const model = new MockLanguageModelV4({doStream: async () => {
        const id = String(++calls);
        return {stream: new ReadableStream({start(controller) {
            controller.enqueue({type: 'stream-start', warnings: []});
            controller.enqueue({type: 'tool-call', toolCallId: id, toolName: 'read', input: '{}'});
            controller.enqueue({type: 'finish', finishReason: {unified: 'tool-calls'},
                usage: {inputTokens: {total: 100, noCache: 0, cacheRead: 100}, outputTokens: {total: 10, text: 0, reasoning: 10}}});
            controller.close();
        }})};
    }});
    const result = streamText({model, prompt: 'Keep reading', tools: {read: tool({inputSchema: z.object({}), execute: async () => 'ok'})},
        onStepEnd: ({usage}) => { steps.push(usageRecord(usage)); reason = runStopReason(settings, steps); },
        stopWhen: [isStepCount(10), () => Boolean(reason)]});
    for await (const event of result.stream) if (event.type === 'error') throw event.error;
    assert.equal(calls, 2);
    assert.match(reason, /200-token/);
    assert.equal(runStopReason({...settings, tokenBudget: 0}, steps), '');
});

test('real SDK multi-step streaming projects outputs and activates deferred tools', async () => {
    const load = createLoader();
    const raw = {
        getPageText: tool({inputSchema: z.object({}), execute: async () => ({text: 'x'.repeat(20000)})}),
        listScripts: tool({inputSchema: z.object({}), execute: async () => ({scripts: []})}),
    };
    const runtime = load('src/chat/lib/toolRuntime.ts').createToolRuntime(raw, {request: '', findPrevious: () => undefined});
    let step = 0;
    const usage = {inputTokens: {total: 100, noCache: 20, cacheRead: 80}, outputTokens: {total: 10, text: 8, reasoning: 2}};
    const model = new MockLanguageModelV4({doStream: async request => {
        const parts = [{type: 'stream-start', warnings: []}];
        if (step === 0) {
            assert.ok(!request.tools.some(t => t.name === 'listScripts'));
            parts.push({type: 'tool-call', toolCallId: 'enable', toolName: 'enableTools', input: JSON.stringify({groups: ['scripting']})});
        } else if (step === 1) {
            assert.ok(request.tools.some(t => t.name === 'listScripts'));
            parts.push({type: 'tool-call', toolCallId: 'read', toolName: 'getPageText', input: '{}'});
        } else {
            const message = request.prompt.find(m => m.role === 'tool' && m.content.some(p => p.toolCallId === 'read'));
            const result = message.content.find(p => p.toolCallId === 'read');
            assert.ok(result.output.value.length <= 6000);
            parts.push({type: 'text-start', id: 'answer'}, {type: 'text-delta', id: 'answer', delta: 'Done'}, {type: 'text-end', id: 'answer'});
        }
        parts.push({type: 'finish', finishReason: {unified: step++ < 2 ? 'tool-calls' : 'stop', raw: undefined}, usage});
        return {stream: new ReadableStream({start(controller) { parts.forEach(part => controller.enqueue(part)); controller.close(); }})};
    }});
    const result = streamText({model, prompt: 'Read the page', tools: runtime.tools,
        prepareStep: () => ({activeTools: runtime.activeTools()}), stopWhen: isStepCount(5)});
    const events = [];
    for await (const event of result.stream) { if (event.type === 'error') throw event.error; events.push(event); }
    assert.equal(step, 3);
    assert.equal(await result.text, 'Done');
    assert.equal(events.find(e => e.type === 'tool-result' && e.toolCallId === 'read').output.text.length, 20000);
    assert.equal((await result.totalUsage).inputTokens, 300);
});
