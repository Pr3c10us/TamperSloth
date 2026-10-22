import test from 'node:test';
import assert from 'node:assert/strict';
import {APICallError, generateText, isStepCount, streamText, tool} from 'ai';
import {z} from 'zod';
import {createLoader} from './load-ts.mjs';

// The TamperSloth API is mocked at the transport: these check what the
// extension sends and how it reads the NDJSON stream parts back.

const jwt = exp => `h.${btoa(JSON.stringify({id: 'user-1', exp}))}.s`;
const LIVE = jwt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600);

function fakeStorage(session) {
    const items = new Map(session ? [['ts_account_session', JSON.stringify(session)]] : []);
    return {
        getItem: key => items.get(key) ?? null,
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: key => items.delete(key),
        items,
    };
}

function loadProvider(session = {token: LIVE, refreshToken: 'refresh-1'}) {
    const localStorage = fakeStorage(session);
    const load = createLoader({globals: {localStorage, atob, btoa, Response, TextDecoderStream, TransformStream, ReadableStream}});
    return {...load('src/chat/lib/provider.ts'), ...load('src/chat/lib/providerCompatibility.ts'), localStorage};
}

const ndjson = parts => new Response(parts.map(p => JSON.stringify(p)).join('\n') + '\n',
    {headers: {'content-type': 'application/x-ndjson'}});

const usage = (input, output) => ({
    inputTokens: {total: input, noCache: input, cacheRead: 0, cacheWrite: 0},
    outputTokens: {total: output, text: output, reasoning: 0},
});

function toolStep() {
    return [
        {type: 'stream-start', warnings: []},
        {type: 'response-metadata', id: 'msg-0', modelId: 'sloth-pro', timestamp: '2026-10-21T00:00:00.000Z'},
        {type: 'reasoning-start', id: 'r0'},
        {type: 'reasoning-delta', id: 'r0', delta: 'Read the page first'},
        {type: 'reasoning-end', id: 'r0', providerMetadata: {anthropic: {signature: 'sig-0'}}},
        {type: 'tool-input-start', id: 'call-1', toolName: 'getPageText'},
        {type: 'tool-input-delta', id: 'call-1', delta: '{"page":1}'},
        {type: 'tool-input-end', id: 'call-1'},
        {type: 'tool-call', toolCallId: 'call-1', toolName: 'getPageText', input: '{"page":1}'},
        {type: 'finish', usage: usage(100, 20), finishReason: {unified: 'tool-calls', raw: 'tool_use'}},
    ];
}

function textStep(text = 'Done') {
    return [
        {type: 'stream-start', warnings: []},
        {type: 'text-start', id: 't0'},
        {type: 'text-delta', id: 't0', delta: text},
        {type: 'text-end', id: 't0'},
        {type: 'finish', usage: usage(150, 5), finishReason: {unified: 'stop', raw: 'end_turn'}},
    ];
}

test('a Sloth tool loop sends sanitizable options and replays reasoning signatures', async () => {
    const {getModel, agentProviderOptions} = loadProvider();
    const requests = [];
    const transport = async (url, init) => {
        requests.push({url, headers: init.headers, body: JSON.parse(init.body)});
        return ndjson(requests.length === 1 ? toolStep() : textStep());
    };
    const result = await generateText({
        model: getModel('tampersloth', 'ignored', 'sloth-pro', transport),
        messages: [{role: 'user', content: [
            {type: 'text', text: 'What does the page say?'},
            {type: 'image', image: new Uint8Array([97]), mediaType: 'image/png'},
        ]}],
        tools: {getPageText: tool({inputSchema: z.object({page: z.number()}), execute: async ({page}) => ({page, text: 'Hello'})})},
        providerOptions: agentProviderOptions('tampersloth', 'high'),
        stopWhen: isStepCount(5),
    });

    assert.equal(result.text, 'Done');
    assert.equal(requests.length, 2);
    const [first, second] = requests;
    assert.match(first.url, /\/api\/v1\/models\/sloth-pro\/stream$/);
    assert.equal(first.headers.Authorization, `Bearer ${LIVE}`);
    assert.deepEqual(first.body.options.providerOptions, {tampersloth: {effort: 'high'}});
    assert.equal(first.body.options.tools[0].name, 'getPageText');
    // Bytes travel as base64, never as a URL for the server to fetch.
    const file = first.body.options.prompt[0].content.find(p => p.type === 'file');
    assert.deepEqual(file.data, {type: 'data', data: 'YQ=='});

    const assistant = second.body.options.prompt.find(m => m.role === 'assistant');
    const reasoning = assistant.content.find(p => p.type === 'reasoning');
    assert.equal(reasoning.providerOptions.anthropic.signature, 'sig-0');
    const toolMessage = second.body.options.prompt.find(m => m.role === 'tool');
    assert.equal(toolMessage.content[0].toolCallId, 'call-1');
    assert.equal(result.totalUsage.inputTokens, 250);
});

test('every step of a run names the run, so the server can hold it to the plan budget', async () => {
    const {getModel} = loadProvider();
    const headers = [];
    const transport = async (url, init) => {
        headers.push(init.headers);
        return ndjson(headers.length === 1 ? toolStep() : textStep());
    };
    const model = getModel('tampersloth', '', 'sloth-pro', transport);
    await generateText({
        model, prompt: 'Read it', headers: {'X-Sloth-Run': 'run-0001'}, stopWhen: isStepCount(5),
        tools: {getPageText: tool({inputSchema: z.object({page: z.number()}), execute: async () => 'Hello'})},
    });
    assert.deepEqual(headers.map(h => h['X-Sloth-Run']), ['run-0001', 'run-0001']);
    // Other call headers stay on the client; a call outside a run names none.
    assert.equal(Object.keys(headers[0]).some(name => /user-agent/i.test(name)), false);
    await generateText({model, prompt: 'Title this'});
    assert.equal('X-Sloth-Run' in headers[2], false);
});

test('a Sloth plan run budget caps the user setting, whichever is lower', () => {
    const load = createLoader();
    const {withPlanRunBudget, DEFAULT_AGENT_SETTINGS} = load('src/chat/lib/agentSettings.ts');
    assert.equal(withPlanRunBudget({...DEFAULT_AGENT_SETTINGS, tokenBudget: 1_000_000}, 500_000).tokenBudget, 500_000);
    assert.equal(withPlanRunBudget({...DEFAULT_AGENT_SETTINGS, tokenBudget: 200_000}, 500_000).tokenBudget, 200_000);
    assert.equal(withPlanRunBudget({...DEFAULT_AGENT_SETTINGS, tokenBudget: 0}, 500_000).tokenBudget, 500_000);
    assert.equal(withPlanRunBudget({...DEFAULT_AGENT_SETTINGS, tokenBudget: 0}, 0).tokenBudget, 0);
    assert.equal(withPlanRunBudget({...DEFAULT_AGENT_SETTINGS, tokenBudget: 300}, undefined).tokenBudget, 300);
});

test('streaming reads NDJSON split across arbitrary chunk boundaries', async () => {
    const {getModel} = loadProvider();
    const body = textStep('Hello there').map(p => JSON.stringify(p)).join('\n') + '\n';
    const transport = async () => new Response(new ReadableStream({
        start(controller) {
            const bytes = new TextEncoder().encode(body);
            for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
            controller.close();
        },
    }));
    const result = streamText({model: getModel('tampersloth', '', 'sloth-mini', transport), prompt: 'Hi'});
    assert.equal(await result.text, 'Hello there');
});

test('a plan error reaches the user as the server wrote it, with its status', async () => {
    const {getModel} = loadProvider();
    const message = "You've used this month's $1 of Free credit. It renews on the 1st.";
    const transport = async () => new Response(JSON.stringify({statusCode: 402, message, code: 'CREDITS_EXHAUSTED'}),
        {status: 402, headers: {'content-type': 'application/json'}});
    await assert.rejects(
        generateText({model: getModel('tampersloth', '', 'sloth-pro', transport), prompt: 'Hi', maxRetries: 0}),
        error => APICallError.isInstance(error) && error.statusCode === 402 && error.message === message,
    );
});

test('a 429 keeps Retry-After so the rate-limit wait can honour it', async () => {
    const {getModel} = loadProvider();
    const transport = async () => new Response(JSON.stringify({statusCode: 429, message: 'Slow down', code: 'RATE_LIMITED'}),
        {status: 429, headers: {'content-type': 'application/json', 'retry-after': '12'}});
    await assert.rejects(
        generateText({model: getModel('tampersloth', '', 'sloth-pro', transport), prompt: 'Hi', maxRetries: 0}),
        error => error.statusCode === 429 && error.responseHeaders['retry-after'] === '12',
    );
});

test('an expiring session is renewed before the model request', async () => {
    const stale = jwt(Math.floor(Date.now() / 1000) + 60);
    const {getModel, localStorage} = loadProvider({token: stale, refreshToken: 'refresh-1'});
    const calls = [];
    const transport = async (url, init) => {
        calls.push({url, init});
        if (url.endsWith('/auth/extension/token')) {
            assert.deepEqual(JSON.parse(init.body), {refreshToken: 'refresh-1'});
            return new Response(JSON.stringify({data: {token: LIVE, refreshToken: 'refresh-2'}}), {headers: {'content-type': 'application/json'}});
        }
        return ndjson(textStep());
    };
    const result = await generateText({model: getModel('tampersloth', '', 'sloth-mini', transport), prompt: 'Hi'});
    assert.equal(result.text, 'Done');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].init.headers.Authorization, `Bearer ${LIVE}`);
    assert.equal(JSON.parse(localStorage.items.get('ts_account_session')).refreshToken, 'refresh-2');
});
