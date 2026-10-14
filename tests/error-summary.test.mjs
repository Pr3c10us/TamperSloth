import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-ts.mjs';

const {summarizeError} = createLoader()('src/chat/lib/errorSummary.ts');

const TOOL_INPUT = 'AI_InvalidToolInputError: Invalid input for tool askUser: AI_TypeValidationError: Type validation failed: Value: {"question":"How?","options":["A","B"]}. Error message: [ { "expected": "object", "code": "invalid_type", "path": [ "options", 0 ], "message": "Invalid input: expected object, received string" } ]';

test('malformed tool input becomes one plain sentence with the raw text as details', () => {
    const {summary, details} = summarizeError(TOOL_INPUT);
    assert.equal(summary, 'The model sent a malformed tool request.');
    assert.equal(details, TOOL_INPUT);
});

test('common provider failures get friendly summaries', () => {
    assert.match(summarizeError('429 Too Many Requests: You exceeded your current quota').summary, /rate-limiting/);
    assert.match(summarizeError('401 Unauthorized: Incorrect API key provided: sk-...').summary, /API key/);
    assert.match(summarizeError('TypeError: Failed to fetch').summary, /Couldn't reach/);
    assert.match(summarizeError('{"error":{"code":503,"message":"The model is overloaded."}}').summary, /trouble/);
    assert.match(summarizeError("This model's maximum context length is 128000 tokens.").summary, /too long/);
});

test('short plain messages pass through without a details toggle', () => {
    const notice = 'Reached the 25-step limit. Work may be incomplete. Send another message to continue.';
    assert.deepEqual({...summarizeError(notice)}, {summary: notice});
    assert.deepEqual({...summarizeError('')}, {summary: 'Something went wrong.'});
});

test('unknown long errors fall back to their first sentence', () => {
    const raw = 'Something odd happened in the pipeline. ' + 'x'.repeat(300);
    assert.deepEqual({...summarizeError(raw)}, {summary: 'Something odd happened in the pipeline.', details: raw});
});
