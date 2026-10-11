import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-ts.mjs';

const load = createLoader();
const {estimateUsageCost, estimateRunCost, formatCost} = load('src/chat/lib/pricing.ts');
const {MODELPROVIDERS} = load('src/chat/lib/provider.ts');
const sunday = Date.UTC(2026, 9, 11, 7);
const mondayPeak = Date.UTC(2026, 9, 12, 7);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('every selectable model has separate input and output pricing', () => {
    for (const provider of MODELPROVIDERS) {
        for (const model of provider.models) {
            const cost = estimateUsageCost(provider.id, model, {input: 1000, output: 1000}, sunday);
            assert.ok(cost?.input > 0, `${provider.id}/${model}: input pricing`);
            assert.ok(cost?.output > 0, `${provider.id}/${model}: output pricing`);
        }
    }
});

test('cache reads/writes replace regular input; reasoning is not counted twice', () => {
    const cost = estimateUsageCost('anthropic', 'claude-opus-5-5',
        {input: 10000, cacheRead: 6000, cacheWrite: 2000, output: 1000, reasoning: 800}, sunday);
    close(cost.input, .0192);
    close(cost.output, .02);
    const cached = estimateUsageCost('openai', 'gpt-6.1-sol', {input: 10000, cacheRead: 8000, output: 0}, sunday);
    close(cached.input, .0048);
    assert.equal(cached.output, 0);
});

test('multi-step runs apply context tiers per request rather than aggregate input', () => {
    const step = input => ({input, output: 1000, activeTools: 0, contextChars: 0});
    const metrics = {providerId: 'google', modelId: 'gemini-3.1-pro-preview', startedAt: sunday,
        steps: [step(150000), step(150000)], total: {input: 300000, output: 2000}, tools: [], compactedResults: 0, elapsedMs: 100};
    const cost = estimateRunCost(metrics);
    close(cost.input, .6);
    close(cost.output, .024);
    const long = estimateRunCost({...metrics, steps: [step(200001)]});
    close(long.input, .800004);
    close(long.output, .018);
    const haiku = estimateUsageCost('anthropic', 'claude-haiku-5-5', {input: 100001, output: 1000}, sunday);
    close(haiku.input, .0500005);
    close(haiku.output, .0025);
});

test('DeepSeek uses UTC request times and Gemini promo rates use the run date', () => {
    const usage = {input: 1000000, cacheRead: 500000, output: 1000000};
    const offPeak = estimateUsageCost('deepseek', 'deepseek-flash', usage, sunday);
    const peak = estimateUsageCost('deepseek', 'deepseek-flash', usage, mondayPeak);
    close(offPeak.input, .0765);
    close(peak.input, .153);
    close(offPeak.output, .6);
    close(peak.output, 1.2);
    const promo = estimateUsageCost('google', 'gemini-3.8-flash', usage, sunday);
    const regular = estimateUsageCost('google', 'gemini-3.8-flash', usage, Date.UTC(2027, 0, 1));
    close(regular.input, promo.input * 2);
    close(regular.output, promo.output * 2);
    const cost = estimateRunCost({providerId: 'deepseek', modelId: 'deepseek-flash', startedAt: sunday,
        steps: [{...usage, recordedAt: sunday}, {...usage, recordedAt: mondayPeak}]});
    close(cost.output, 1.8);
});

test('unknown legacy models and missing usage never masquerade as free', () => {
    assert.equal(estimateRunCost({steps: [], total: {input: 1000, output: 1000}}), undefined);
    assert.equal(estimateUsageCost('openai', 'unknown', {input: 1000}, sunday), undefined);
    const missing = estimateUsageCost('openai', 'gpt-6.1-sol', {output: 0}, sunday);
    assert.equal(missing.input, undefined);
    assert.equal(missing.output, 0);
    assert.equal(formatCost(undefined), 'unavailable');
    assert.equal(formatCost(0), '$0.00');
    assert.equal(formatCost(.000001), '<$0.0001');
    assert.equal(formatCost(.01234), '$0.0123');
    assert.equal(estimateUsageCost('openai', 'gpt-6.1-sol', {input: NaN}, sunday).input, undefined);
});
