import test from 'node:test';
import assert from 'node:assert/strict';
import {APICallError, generateText, streamText} from 'ai';
import {MockLanguageModelV4} from 'ai/test';
import {createLoader} from './load-ts.mjs';

const fresh = () => createLoader()('src/chat/lib/rateLimit.ts');

const rateLimited = (message, extra = {}) => new APICallError({
    message, url: 'https://api.example.test', requestBodyValues: {}, statusCode: 429, ...extra,
});
const RPM = 'Rate limit reached for gpt-6-luna on requests per min (RPM): Limit 3, Used 3. Please try again in 20s.';
const GEMINI_FREE = 'You exceeded your current quota. * Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro Please retry in 16h9m8.322921306s.';
const OPENAI_TPM = 'Rate limit reached for gpt-6-luna on tokens per min (TPM): Limit 100000, Used 99125. Please try again in 65h25m9.12s.';

const reply = {content: [{type: 'text', text: 'done'}], finishReason: {unified: 'stop', raw: 'stop'},
    usage: {inputTokens: {total: 1}, outputTokens: {total: 1}}, warnings: []};

test('a rate-limited call waits a minute, shows why, and carries on', async () => {
    const {withRateLimitRetry, rateLimitWait} = fresh();
    const waited = [];
    let calls = 0;
    const result = await withRateLimitRetry(async () => {
        if (++calls < 3) throw rateLimited(RPM);
        return 'ok';
    }, {conversationId: 'c', modelName: 'GPT 6 Luna', wait: async (ms) => {
        const wait = rateLimitWait('c');
        assert.equal(wait.modelName, 'GPT 6 Luna');
        assert.equal(wait.retry, waited.length + 1);
        waited.push(ms);
    }});
    assert.equal(result, 'ok');
    assert.deepEqual(waited, [60_000, 60_000]);
    assert.equal(rateLimitWait('c'), null);
});

test('a provider hint longer than a minute is honoured', async () => {
    const {withRateLimitRetry} = fresh();
    const waited = [];
    let calls = 0;
    await withRateLimitRetry(async () => {
        if (++calls < 2) throw rateLimited('Too many requests.', {responseHeaders: {'retry-after': '90'}});
        return 'ok';
    }, {conversationId: 'c', modelName: 'M', wait: async (ms) => { waited.push(ms); }});
    assert.deepEqual(waited, [91_000]);
});

test('gives up after three retries and points at the model picker', async () => {
    const {withRateLimitRetry, RATE_LIMIT_RETRIES} = fresh();
    let calls = 0;
    await assert.rejects(
        withRateLimitRetry(async () => { calls++; throw rateLimited(RPM); },
            {conversationId: 'c', modelName: 'GPT 6 Luna', wait: async () => {}}),
        (error) => error.name === 'RateLimitError' && /after 3 retries/.test(error.message) && /different model/.test(error.message),
    );
    assert.equal(calls, RATE_LIMIT_RETRIES + 1);
});

test('used-up quota fails at once instead of waiting hours', async () => {
    const {withRateLimitRetry} = fresh();
    for (const message of [GEMINI_FREE, OPENAI_TPM]) {
        let waits = 0;
        await assert.rejects(
            withRateLimitRetry(async () => { throw rateLimited(message); },
                {conversationId: 'c', modelName: 'M', wait: async () => { waits++; }}),
            (error) => error.name === 'RateLimitError' && /out of quota/.test(error.message) && /different model/.test(error.message),
        );
        assert.equal(waits, 0);
    }
});

test('other errors pass straight through', async () => {
    const {withRateLimitRetry} = fresh();
    const failure = new APICallError({message: 'bad key', url: 'x', requestBodyValues: {}, statusCode: 401});
    await assert.rejects(withRateLimitRetry(async () => { throw failure; }, {conversationId: 'c', modelName: 'M'}), failure);
});

test('stopping the run ends the wait', async () => {
    const {withRateLimitRetry, rateLimitWait} = fresh();
    const controller = new AbortController();
    const run = withRateLimitRetry(async () => { throw rateLimited(RPM); }, {conversationId: 'c', modelName: 'M'}, controller.signal);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(rateLimitWait('c'));
    controller.abort();
    await assert.rejects(run, (error) => error.name === 'AbortError');
    assert.equal(rateLimitWait('c'), null);
});

test('parses provider retry hints', () => {
    const {retryAfterMs, parseDuration} = fresh();
    assert.equal(parseDuration('16h9m8.5s'), 58_148_500);
    assert.equal(parseDuration('500ms'), 500);
    assert.equal(retryAfterMs(rateLimited(RPM)), 20_000);
    assert.equal(retryAfterMs(rateLimited('x', {responseBody: '{"retryDelay": "37s"}'})), 37_000);
    assert.equal(retryAfterMs(rateLimited('x', {responseHeaders: {'retry-after-ms': '1500'}})), 1500);
    assert.equal(retryAfterMs(rateLimited('x')), null);
});

test('the SDK does not stack its own retries on a wrapped model', async () => {
    const {withRateLimits} = fresh();
    let calls = 0;
    const model = withRateLimits(new MockLanguageModelV4({doGenerate: async () => {
        calls++;
        if (calls < 2) throw rateLimited(RPM);
        return reply;
    }}), {conversationId: 'c', modelName: 'M', wait: async () => {}});
    const {text} = await generateText({model, prompt: 'hi'});
    assert.equal(text, 'done');
    assert.equal(calls, 2);

    calls = 0;
    const stuck = withRateLimits(new MockLanguageModelV4({doStream: async () => { calls++; throw rateLimited(RPM); }}),
        {conversationId: 'c', modelName: 'Stuck', wait: async () => {}});
    const errors = [];
    for await (const part of streamText({model: stuck, prompt: 'hi'}).stream) if (part.type === 'error') errors.push(part.error);
    assert.equal(calls, 4);
    assert.match(errors[0].message, /^Stuck is still rate limited/);
});
