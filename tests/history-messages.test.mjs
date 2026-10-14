import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader, plain} from './load-ts.mjs';

const {buildModelMessages} = createLoader()('src/chat/lib/historyMessages.ts');
const image = name => ({id: name, kind: 'image', name, mediaType: 'image/png'});
const options = {loadAttachment: async a => 'data:' + a.name, summarizeElement: html => 'summary of ' + html, maxAttachments: 3};
const files = content => plain(content).filter(part => part.type === 'file').map(part => part.data);
const text = content => typeof content === 'string' ? content : content.find(part => part.type === 'text')?.text;

test('earlier attachments and selected elements are resent on later turns', async () => {
    const messages = await buildModelMessages([
        {role: 'user', content: 'look', attachments: [image('a')], pickedElements: ['<p>x</p>']},
        {role: 'assistant', content: 'seen'},
        {role: 'user', content: 'do something'},
    ], options);
    assert.deepEqual(files(messages[0].content), ['data:a']);
    assert.match(text(messages[0].content), /\[Selected element 1\]: summary of <p>x<\/p>/);
    assert.equal(messages[2].content, 'do something');
});

test('the newest attachments win the budget and older ones become a note', async () => {
    const messages = await buildModelMessages([
        {role: 'user', content: 'old', attachments: [image('o1'), image('o2')]},
        {role: 'assistant', content: 'ok'},
        {role: 'user', content: 'mid', attachments: [image('m1'), image('m2')]},
        {role: 'assistant', content: 'ok'},
        {role: 'user', content: 'new', attachments: [image('n1'), image('n2')]},
    ], options);
    assert.deepEqual(files(messages[4].content), ['data:n1', 'data:n2']);
    assert.deepEqual(files(messages[2].content), ['data:m1']);
    assert.match(text(messages[2].content), /Attachments not shown: m2/);
    assert.deepEqual(files(messages[0].content), []);
    assert.match(text(messages[0].content), /Attachments not shown: o1, o2/);
});

test('the newest message keeps all its attachments even past the cap', async () => {
    const many = Array.from({length: 5}, (_, i) => image('n' + i));
    const [message] = await buildModelMessages([{role: 'user', content: '', attachments: many}], options);
    assert.equal(files(message.content).length, 5);
    assert.equal(text(message.content), undefined);
});

test('attachments whose bytes are missing are named instead of dropped silently', async () => {
    const [message] = await buildModelMessages([{role: 'user', content: 'hi', attachments: [{kind: 'image', name: 'legacy.png'}]}],
        {...options, loadAttachment: async a => a.id ? 'data:' + a.name : null});
    assert.match(text(message.content), /Attachments not shown: legacy.png/);
});

test('quoted page text comes before the request, line by line, with its source', async () => {
    const [message] = await buildModelMessages([
        {role: 'user', content: 'what does this mean', pickedElements: ['<p>x</p>'],
            quotes: [{text: 'line one\nline two', url: 'https://example.com/a', title: 'Example'}]},
    ], options);
    assert.equal(message.content, '[Quoted from the page "Example" (https://example.com/a)]:\n> line one\n> line two'
        + '\n\nwhat does this mean\n\n[Selected element 1]: summary of <p>x</p>');
});

test('a quote can be sent on its own', async () => {
    const [message] = await buildModelMessages([{role: 'user', content: '', quotes: [{text: 'just this'}]}], options);
    assert.equal(message.content, '[Quoted from the page]:\n> just this');
});
