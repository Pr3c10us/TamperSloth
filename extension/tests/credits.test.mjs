import test from 'node:test';
import assert from 'node:assert/strict';
import {APICallError, RetryError} from 'ai';
import {createLoader} from './load-ts.mjs';

const fresh = () => createLoader()('src/chat/lib/credits.ts');

const apiError = (statusCode, body) => new APICallError({
    message: body?.message ?? 'nope', url: 'https://api.tampersloth.test', requestBodyValues: {}, statusCode,
    responseBody: body ? JSON.stringify(body) : undefined,
});
const SPENT = {statusCode: 402, message: "You've used this month's 10 Free credits. They renew on the 1st.", code: 'CREDITS_EXHAUSTED'};

test('a 402 for spent credit is recognised, even inside a RetryError', () => {
    const {creditsExhaustedError} = fresh();
    assert.equal(creditsExhaustedError(apiError(402, SPENT))?.message, SPENT.message);
    const wrapped = new RetryError({message: 'failed', reason: 'errorNotRetryable', errors: [apiError(402, SPENT)]});
    assert.equal(creditsExhaustedError(wrapped)?.message, SPENT.message);
});

test('other errors are not out-of-credit', () => {
    const {creditsExhaustedError} = fresh();
    assert.equal(creditsExhaustedError(apiError(429, {message: 'busy', code: 'RATE_LIMITED'})), null);
    assert.equal(creditsExhaustedError(apiError(402, {message: 'other', code: 'SOMETHING_ELSE'})), null);
    assert.equal(creditsExhaustedError(new Error('boom')), null);
});

test('run-budget refusals are plan limits too, each with its own kind', () => {
    const {creditsExhaustedError} = fresh();
    assert.equal(creditsExhaustedError(apiError(402, SPENT))?.limit, 'credits');
    const run = creditsExhaustedError(apiError(402, {message: "This reply reached the Free plan's limit.", code: 'RUN_BUDGET_EXHAUSTED'}));
    assert.deepEqual({...run}, {limit: 'runBudget', message: "This reply reached the Free plan's limit."});
    assert.equal(creditsExhaustedError(apiError(402, {message: 'too long', code: 'RUN_TOO_LONG'}))?.limit, 'runTooLong');
});

test('Sloth models paused for everyone is its own notice; other 503s are plain errors', () => {
    const {creditsExhaustedError} = fresh();
    const paused = {message: "Sloth models aren't available at the moment. Try again later.", code: 'SLOTH_UNAVAILABLE'};
    assert.deepEqual({...creditsExhaustedError(apiError(503, paused))}, {limit: 'unavailable', message: paused.message});
    const wrapped = new RetryError({message: 'failed', reason: 'errorNotRetryable', errors: [apiError(503, paused)]});
    assert.equal(creditsExhaustedError(wrapped)?.limit, 'unavailable');
    assert.equal(creditsExhaustedError(apiError(503, {message: 'Sloth Pro is not available right now', code: 'PROVIDER_UNAVAILABLE'})), null);
    assert.equal(creditsExhaustedError(apiError(503)), null);
});
