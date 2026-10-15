import test from 'node:test';
import assert from 'node:assert/strict';
import {streamText, tool, isStepCount} from 'ai';
import {MockLanguageModelV4} from 'ai/test';
import {z} from 'zod';
import {createLoader, invoke, plain} from './load-ts.mjs';

const load = createLoader();
const {createReasoningNormalizer, thinkingDuration} = load('src/chat/lib/reasoning.ts');
const {partialReason, toolReason, REASON_MAX} = load('src/chat/lib/toolReason.ts');
const {createToolRuntime} = load('src/chat/lib/toolRuntime.ts');
const {agentProviderOptions} = load('src/chat/lib/providerCompatibility.ts');
const {screenshotSource, toolErrorMessage} = load('src/chat/lib/toolPreview.ts');
const {summarizeSteps, toolVerb} = load('src/chat/lib/stepSummary.ts');

function clock() {
    let t = 1000;
    return {now: () => t, advance: ms => { t += ms; }};
}

/** Runs parts through a normalizer and folds the events into blocks like the UI does. */
function fold(parts, normalizer = createReasoningNormalizer()) {
    const blocks = [];
    const apply = events => {
        for (const event of events) {
            const last = blocks.at(-1);
            if (event.type === 'text-delta') {
                if (last?.type === 'text') last.text += event.text;
                else blocks.push({type: 'text', text: event.text});
            } else if (event.type === 'thinking-start') {
                blocks.push({type: 'thinking', text: '', startedAt: event.at, ...(event.redacted ? {redacted: true} : {})});
            } else if (event.type === 'thinking-delta') {
                last.text += event.text;
            } else {
                last.endedAt = event.at;
            }
        }
    };
    for (const part of parts) apply(normalizer.push(part));
    apply(normalizer.flush());
    return blocks;
}

test('native reasoning parts become one timed thinking block that ends when output begins', () => {
    const time = clock();
    const normalizer = createReasoningNormalizer({now: time.now});
    const events = [];
    events.push(...normalizer.push({type: 'reasoning-start', id: 'r'}));
    time.advance(500);
    events.push(...normalizer.push({type: 'reasoning-delta', id: 'r', text: 'Checking the form'}));
    time.advance(11_500);
    events.push(...normalizer.push({type: 'reasoning-end', id: 'r'}));
    time.advance(300);
    events.push(...normalizer.push({type: 'text-delta', id: 't', text: 'Done.'}));
    assert.deepEqual(plain(events), [
        {type: 'thinking-start', at: 1000},
        {type: 'thinking-delta', text: 'Checking the form'},
        // Ends at reasoning-end, not when the answer happens to arrive.
        {type: 'thinking-end', at: 13_000},
        {type: 'text-delta', text: 'Done.'},
    ]);
    assert.equal(thinkingDuration({text: '', startedAt: 1000, endedAt: 13_000}), 12_000);
});

test('OpenAI-style summary parts merge into one block with paragraph breaks', () => {
    const blocks = fold([
        {type: 'reasoning-start', id: 'rs:0'}, {type: 'reasoning-delta', id: 'rs:0', text: '**Plan** first'}, {type: 'reasoning-end', id: 'rs:0'},
        {type: 'reasoning-start', id: 'rs:1'}, {type: 'reasoning-delta', id: 'rs:1', text: 'Then verify'}, {type: 'reasoning-end', id: 'rs:1'},
        {type: 'tool-input-start', id: 'call', toolName: 'getPageText'},
    ]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].text, '**Plan** first\n\nThen verify');
    assert.ok(blocks[0].endedAt !== undefined);
});

test('reasoning in separate steps stays separate around tool calls', () => {
    const blocks = fold([
        {type: 'start-step'}, {type: 'reasoning-delta', text: 'First'}, {type: 'tool-call', toolCallId: 'a'}, {type: 'finish-step'},
        {type: 'start-step'}, {type: 'reasoning-delta', text: 'Second'}, {type: 'text-delta', text: 'Answer'},
    ]);
    assert.deepEqual(blocks.map(b => [b.type, b.text]), [['thinking', 'First'], ['thinking', 'Second'], ['text', 'Answer']]);
});

test('redacted Anthropic thinking is marked so the UI can explain the empty block', () => {
    const blocks = fold([
        {type: 'reasoning-start', id: 'r', providerMetadata: {anthropic: {redactedData: 'abc'}}},
        {type: 'reasoning-end', id: 'r'}, {type: 'text-delta', text: 'Hi'},
    ]);
    assert.equal(blocks[0].redacted, true);
    assert.equal(blocks[0].text, '');
});

test('<think> tags split across arbitrary chunks are extracted from answer text', () => {
    const source = '\n<think>\nThe user wants X.\nCheck Y.</think>\n\nHere is the answer with <b>bold</b>.';
    for (let size = 1; size <= 9; size++) {
        const parts = [];
        for (let i = 0; i < source.length; i += size) parts.push({type: 'text-delta', text: source.slice(i, i + size)});
        const blocks = fold(parts);
        assert.deepEqual(blocks.map(b => b.type), ['thinking', 'text'], `chunk size ${size}`);
        assert.equal(blocks[0].text, 'The user wants X.\nCheck Y.', `chunk size ${size}`);
        assert.equal(blocks[1].text, 'Here is the answer with <b>bold</b>.', `chunk size ${size}`);
        assert.ok(blocks[0].endedAt !== undefined);
    }
});

test('<thinking> and <reasoning> variants are recognized case-insensitively', () => {
    for (const tag of ['thinking', 'Reasoning', 'THINK']) {
        const blocks = fold([{type: 'text-delta', text: `<${tag}>hmm</${tag}>ok`}]);
        assert.deepEqual(blocks.map(b => [b.type, b.text]), [['thinking', 'hmm'], ['text', 'ok']], tag);
    }
});

test('a think tag inside an answer stays visible text', () => {
    const blocks = fold([{type: 'text-delta', text: 'Use the '}, {type: 'text-delta', text: '<think> element? No such tag.'}]);
    assert.deepEqual(blocks.map(b => b.type), ['text']);
    assert.equal(blocks[0].text, 'Use the <think> element? No such tag.');
});

test('text that only resembles a tag prefix is released, and unterminated thinking closes on flush', () => {
    assert.deepEqual(fold([{type: 'text-delta', text: '<th'}, {type: 'text-delta', text: 'ere'}]).map(b => [b.type, b.text]),
        [['text', '<there']]);
    const open = fold([{type: 'text-delta', text: '<think>still going'}]);
    assert.equal(open[0].type, 'thinking');
    assert.equal(open[0].text, 'still going');
    assert.ok(open[0].endedAt !== undefined);
});

test('a new step re-arms tag detection after a tool call', () => {
    const blocks = fold([
        {type: 'start-step'}, {type: 'text-delta', text: '<think>a</think>Calling'}, {type: 'tool-call'}, {type: 'finish-step'},
        {type: 'start-step'}, {type: 'text-delta', text: '<think>b</think>Final'},
    ]);
    assert.deepEqual(blocks.map(b => [b.type, b.text]), [['thinking', 'a'], ['text', 'Calling'], ['thinking', 'b'], ['text', 'Final']]);
});

test('partial tool JSON yields the reason as soon as it is being written', () => {
    assert.equal(partialReason('{"rea'), undefined);
    assert.equal(partialReason('{"reason":"'), undefined);
    assert.equal(partialReason('{"reason":"Find the che'), 'Find the che');
    assert.equal(partialReason('{"reason":"Say \\"hi\\" now","selector":"#a"}'), 'Say "hi" now');
    assert.equal(partialReason('{"reason":"Tab\\'), 'Tab');
    assert.equal(partialReason('{"reason":"caf\\u00e'), 'caf');
    assert.equal(partialReason('{"reason":"caf\\u00e9"}'), 'café');
    assert.equal(toolReason({reason: '  Check cart  '}), 'Check cart');
    assert.equal(toolReason({description: 'Legacy label'}), 'Legacy label');
    assert.equal(toolReason({reason: ''}), undefined);
});

test('every runtime tool requires a leading reason that never reaches the implementation', async () => {
    const browserLoad = createLoader({mocks: {'./storage': {}}});
    const raw = browserLoad('src/chat/lib/tools.ts').createAgentTools({conversationId: 'reason'});
    const runtime = browserLoad('src/chat/lib/toolRuntime.ts').createToolRuntime(raw, {request: '', findPrevious: () => undefined});
    for (const [name, definition] of Object.entries(runtime.tools)) {
        const schema = z.toJSONSchema(definition.inputSchema, {io: 'input'});
        assert.equal(Object.keys(schema.properties)[0], 'reason', name);
        assert.ok(schema.required.includes('reason'), name);
        assert.ok(!('description' in schema.properties), `${name} still exposes the old optional label`);
    }

    let received;
    const runtime2 = createToolRuntime({
        read: tool({inputSchema: z.object({page: z.number()}), execute: async input => { received = input; return {ok: true}; }}),
    }, {request: '', findPrevious: () => undefined});
    await invoke(runtime2.tools, 'read', {reason: 'Read page two', page: 2});
    assert.deepEqual({...received}, {page: 2});
    // Missing or overlong reasons are cosmetic and never fail the call.
    assert.equal(runtime2.tools.read.inputSchema.parse({page: 1}).reason, '');
    assert.equal(runtime2.tools.read.inputSchema.parse({page: 1, reason: 'x'.repeat(500)}).reason.length, REASON_MAX);
});

test('a real SDK stream normalizes reasoning, inline tags and streamed reasons together', async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({doStream: async () => {
        const step = calls++;
        return {stream: new ReadableStream({start(controller) {
            controller.enqueue({type: 'stream-start', warnings: []});
            if (step === 0) {
                controller.enqueue({type: 'reasoning-start', id: 'r'});
                controller.enqueue({type: 'reasoning-delta', id: 'r', delta: 'Need the page'});
                controller.enqueue({type: 'reasoning-end', id: 'r'});
                controller.enqueue({type: 'tool-input-start', id: 'c1', toolName: 'read'});
                controller.enqueue({type: 'tool-input-delta', id: 'c1', delta: '{"reason":"Read the '});
                controller.enqueue({type: 'tool-input-delta', id: 'c1', delta: 'article","page":1}'});
                controller.enqueue({type: 'tool-input-end', id: 'c1'});
                controller.enqueue({type: 'tool-call', toolCallId: 'c1', toolName: 'read', input: '{"reason":"Read the article","page":1}'});
                controller.enqueue({type: 'finish', finishReason: {unified: 'tool-calls'}, usage: {inputTokens: {total: 1}, outputTokens: {total: 1}}});
            } else {
                controller.enqueue({type: 'text-start', id: 't'});
                controller.enqueue({type: 'text-delta', id: 't', delta: '<think>It says'});
                controller.enqueue({type: 'text-delta', id: 't', delta: ' hello</think>The page says hello.'});
                controller.enqueue({type: 'text-end', id: 't'});
                controller.enqueue({type: 'finish', finishReason: {unified: 'stop'}, usage: {inputTokens: {total: 1}, outputTokens: {total: 1}}});
            }
            controller.close();
        }})};
    }});
    const runtime = createToolRuntime({read: tool({inputSchema: z.object({page: z.number()}), execute: async () => ({text: 'hello'})})},
        {request: '', findPrevious: () => undefined});
    const result = streamText({model, prompt: 'Read it', tools: runtime.tools, stopWhen: isStepCount(3)});
    const parts = [];
    const reasons = [];
    let json = '';
    for await (const part of result.stream) {
        if (part.type === 'error') throw part.error;
        parts.push(part);
        if (part.type === 'tool-input-delta') reasons.push(partialReason(json += part.delta));
    }
    assert.deepEqual(reasons, ['Read the', 'Read the article']);
    const blocks = fold(parts);
    assert.deepEqual(blocks.map(b => [b.type, b.text]), [['thinking', 'Need the page'], ['thinking', 'It says hello'], ['text', 'The page says hello.']]);
    assert.ok(blocks.filter(b => b.type === 'thinking').every(b => b.endedAt >= b.startedAt));
});

test('provider options request readable reasoning from every provider', () => {
    assert.deepEqual(plain(agentProviderOptions('anthropic', 'balanced').anthropic.thinking), {type: 'adaptive', display: 'summarized'});
    assert.equal(agentProviderOptions('openai', 'balanced').openai.reasoningSummary, 'auto');
    assert.equal(agentProviderOptions('google', 'balanced').google.thinkingConfig.includeThoughts, true);
    assert.equal(agentProviderOptions('vertex', 'balanced').vertex.thinkingConfig.includeThoughts, true);
    assert.equal(agentProviderOptions('deepseek', 'thorough').deepseek.thinking.type, 'enabled');
});

test('only screenshot tools expose an image, and errors surface their message', () => {
    const shot = 'data:image/png;base64,iVBORw0KGgo=';
    assert.equal(screenshotSource('takeScreenshot', {screenshot: shot, metadata: {}}), shot);
    assert.equal(screenshotSource('takeMarkedScreenshot', {screenshot: shot}), shot);
    assert.equal(screenshotSource('waitForUserAction', {screenshot: shot}), undefined);
    assert.equal(screenshotSource('takeScreenshot', {screenshot: 'javascript:alert(1)'}), undefined);
    assert.equal(screenshotSource('takeScreenshot', {error: 'Tab closed'}), undefined);
    assert.equal(toolErrorMessage({error: 'No element matches #buy'}), 'No element matches #buy');
    assert.equal(toolErrorMessage(new Error('boom')), 'boom');
    assert.equal(toolErrorMessage({ok: true}), undefined);
});

test('step sequences summarize into one short label', () => {
    assert.equal(summarizeSteps([
        {kind: 'thinking', durationMs: 12_400},
        {kind: 'tool', name: 'getPageText'},
        {kind: 'tool', name: 'clickTarget', failed: true},
        {kind: 'tool', name: 'clickTarget'},
    ]), 'Thought for 12s, read the page, clicked, used 3 tools, 1 failed');
    assert.equal(summarizeSteps([{kind: 'tool', name: 'strReplaceTool', args: {path: 'scripts/hide-banner.js'}}, {kind: 'tool', name: 'saveScript'}]),
        'Edited hide-banner.js, saved a change, used 2 tools');
    assert.equal(summarizeSteps([{kind: 'thinking', durationMs: 300}, {kind: 'thinking'}]), 'Thought');
    assert.equal(summarizeSteps([{kind: 'thinking', durationMs: 4000}, {kind: 'tool', name: 'takeScreenshot'}]), 'Thought for 4s, took a screenshot');
    assert.equal(toolVerb('mysteryTool'), 'used mysteryTool');
});
