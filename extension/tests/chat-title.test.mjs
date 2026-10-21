import test from 'node:test';
import assert from 'node:assert/strict';
import {MockLanguageModelV4} from 'ai/test';
import {createLoader} from './load-ts.mjs';

const load = createLoader();
const {cleanTitle, requestTitle, generateChatTitle, TITLE_MAX} = load('src/chat/lib/chatTitle.ts');

test('cleanTitle keeps one plain line', () => {
    assert.equal(cleanTitle('"Hide YouTube Shorts."'), 'Hide YouTube Shorts');
    assert.equal(cleanTitle('Title: **Dark mode for Gmail**\n\nThis title describes…'), 'Dark mode for Gmail');
    assert.equal(cleanTitle('<think>user wants prices</think>\nCompare laptop prices'), 'Compare laptop prices');
    assert.equal(cleanTitle('x'.repeat(100)).length, TITLE_MAX);
});

test('requestTitle clips the raw request', () => {
    assert.equal(requestTitle('  fix   the\nheader '), 'fix the header');
    assert.ok(requestTitle('y'.repeat(100)).endsWith('…'));
});

test('generateChatTitle asks the model and cleans its reply', async () => {
    let prompt;
    const model = new MockLanguageModelV4({doGenerate: async (options) => {
        prompt = options.prompt;
        return {content: [{type: 'text', text: '"Summarize this article."'}], finishReason: {unified: 'stop', raw: 'stop'},
            usage: {inputTokens: {total: 10}, outputTokens: {total: 4}}, warnings: []};
    }});
    const title = await generateChatTitle(model, 'anthropic', {text: 'can you tl;dr this page', attachmentNames: ['notes.pdf']});
    assert.equal(title, 'Summarize this article');
    const user = JSON.stringify(prompt.find(m => m.role === 'user'));
    assert.match(user, /tl;dr this page/);
    assert.match(user, /notes\.pdf/);
});
