import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader, plain} from './load-ts.mjs';

// Which model the selection lands on after a key or the account changes.

const account = {
    user: {id: 'user-1', email: 'sloth@example.com'},
    plan: {id: 'free', name: 'Free', monthlyCreditUsd: 1, requestsPerMinute: 30, defaultModel: 'sloth-mini'},
    usage: {spentUsd: 0, creditUsd: 1, periodStart: '', periodEnd: ''},
    models: [
        {id: 'sloth-mini', available: true},
        {id: 'sloth-pro', available: true},
        {id: 'sloth-max', available: false},
    ],
};

function setup({keys = {}, selected = null, signedIn = false} = {}) {
    const items = new Map([['ts_api_keys', JSON.stringify(keys)]]);
    if (selected) items.set('ts_selected_model', JSON.stringify(selected));
    if (signedIn) {
        items.set('ts_account_session', JSON.stringify({token: 't', refreshToken: 'r'}));
        items.set('ts_account_cache', JSON.stringify(account));
    }
    const localStorage = {
        getItem: key => items.get(key) ?? null,
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: key => items.delete(key),
    };
    const load = createLoader({globals: {localStorage, atob, btoa, Response, TextDecoderStream, TransformStream, ReadableStream}});
    const {reconcileSelectedModel} = load('src/chat/lib/modelFallback.ts');
    const saved = () => items.has('ts_selected_model') ? JSON.parse(items.get('ts_selected_model')) : null;
    return {reconcile: async added => plain(await reconcileSelectedModel(added)), saved, items};
}

test('removing the selected provider\'s key moves to the next connected provider\'s default', async () => {
    const {reconcile, saved} = setup({keys: {google: 'g'}, selected: {providerId: 'openai', modelId: 'gpt-6-luna'}, signedIn: true});
    assert.deepEqual(await reconcile(), {providerId: 'google', modelId: 'gemini-3.8-flash'});
    assert.deepEqual(saved(), {providerId: 'google', modelId: 'gemini-3.8-flash'});
});

test('removing the last key falls back to the Sloth plan default when signed in', async () => {
    const {reconcile} = setup({selected: {providerId: 'openai', modelId: 'gpt-6-luna'}, signedIn: true});
    assert.deepEqual(await reconcile(), {providerId: 'tampersloth', modelId: 'sloth-mini'});
});

test('removing the last key while signed out clears the selection', async () => {
    const {reconcile, saved} = setup({selected: {providerId: 'openai', modelId: 'gpt-6-luna'}});
    assert.equal(await reconcile(), null);
    assert.equal(saved(), null);
});

test('removing another provider\'s key keeps the selection', async () => {
    const selected = {providerId: 'anthropic', modelId: 'claude-sonnet-5-5'};
    const {reconcile} = setup({keys: {anthropic: 'a'}, selected});
    assert.deepEqual(await reconcile(), selected);
});

test('a new key takes over from a Sloth selection, but not from another BYOK one', async () => {
    const fromSloth = setup({keys: {grok: 'x'}, selected: {providerId: 'tampersloth', modelId: 'sloth-pro'}, signedIn: true});
    assert.deepEqual(await fromSloth.reconcile('grok'), {providerId: 'grok', modelId: 'grok-4.7'});

    const fromNone = setup({keys: {grok: 'x'}});
    assert.deepEqual(await fromNone.reconcile('grok'), {providerId: 'grok', modelId: 'grok-4.7'});

    const byok = {providerId: 'openai', modelId: 'gpt-6-luna'};
    const fromByok = setup({keys: {openai: 'o', grok: 'x'}, selected: byok});
    assert.deepEqual(await fromByok.reconcile('grok'), byok);
});

test('signing in keeps a BYOK model, and otherwise picks the plan default', async () => {
    const byok = {providerId: 'openai', modelId: 'gpt-6-luna'};
    assert.deepEqual(await setup({keys: {openai: 'o'}, selected: byok, signedIn: true}).reconcile(), byok);
    assert.deepEqual(await setup({signedIn: true}).reconcile(), {providerId: 'tampersloth', modelId: 'sloth-mini'});
});

test('a Sloth model the plan doesn\'t include moves to a BYOK default first', async () => {
    const {reconcile} = setup({keys: {deepseek: 'd'}, selected: {providerId: 'tampersloth', modelId: 'sloth-max'}, signedIn: true});
    assert.deepEqual(await reconcile(), {providerId: 'deepseek', modelId: 'deepseek-flash'});
});

test('signing out moves a Sloth selection to a BYOK default', async () => {
    const {reconcile} = setup({keys: {kimi: 'k'}, selected: {providerId: 'tampersloth', modelId: 'sloth-pro'}});
    assert.deepEqual(await reconcile(), {providerId: 'kimi', modelId: 'kimi-k3'});
});
