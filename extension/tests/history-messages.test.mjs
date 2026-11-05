import test from 'node:test';
import assert from 'node:assert/strict';
import {generateText} from 'ai';
import {createLoader, plain} from './load-ts.mjs';

const {buildModelMessages} = createLoader()('src/agent/conversation/historyMessages.ts');
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

const {withInjected, asMidRun, beforeMessage, STOPPED_NOTE, MID_RUN_NOTE} = createLoader()('src/agent/conversation/historyMessages.ts');

test('a stopped reply tells the model it was cut short', async () => {
    const messages = await buildModelMessages([
        {role: 'user', content: 'go'},
        {role: 'assistant', content: 'Working on', stopped: true},
        {role: 'assistant', content: '', stopped: true},
    ], options);
    assert.equal(messages[1].content, 'Working on\n\n' + STOPPED_NOTE);
    assert.equal(messages[2].content, STOPPED_NOTE);
});

test('messages sent mid-run go back after the step they arrived during', () => {
    const r = n => ({role: 'assistant', content: 'r' + n});
    const u = text => ({role: 'user', content: text});
    assert.deepEqual(plain(withInjected([r(0), r(1), r(2)], [])), [r(0), r(1), r(2)]);
    assert.deepEqual(plain(withInjected([r(0), r(1), r(2)], [{at: 0, messages: [u('a')]}, {at: 2, messages: [u('b'), u('c')]}])),
        [u('a'), r(0), r(1), u('b'), u('c'), r(2)]);
    assert.deepEqual(plain(withInjected([r(0)], [{at: 1, messages: [u('end')]}])), [r(0), u('end')]);
});

test('a mid-run message is marked as new direction, with or without attachments', () => {
    assert.equal(asMidRun({role: 'user', content: 'stop clicking'}).content, MID_RUN_NOTE + '\n\nstop clicking');
    const parts = asMidRun({role: 'user', content: [{type: 'text', text: 'see'}, {type: 'file', data: 'x', mediaType: 'image/png'}]}).content;
    assert.deepEqual(plain(parts).map(p => p.type), ['text', 'text', 'file']);
    assert.equal(parts[0].text, MID_RUN_NOTE);
});

test('editing a message hides it and everything after it', () => {
    const list = [{id: 'a'}, {id: 'b'}, {id: 'c'}];
    assert.deepEqual(plain(beforeMessage(list, 'b')), [{id: 'a'}]);
    assert.deepEqual(plain(beforeMessage(list, undefined)), list);
    assert.deepEqual(plain(beforeMessage(list, 'missing')), list);
});

test('a reply with no text is left out once its tool notes have aged out', async () => {
    const history = [
        {role: 'user', content: 'first'},
        {role: 'assistant', content: '', taskState: '{"read":"page"}'},
        {role: 'assistant', content: 'done'},
        {role: 'user', content: 'second'},
        {role: 'assistant', content: 'ok'},
        {role: 'user', content: 'third'},
    ];
    assert.deepEqual(plain(await buildModelMessages(history, options)).map(m => m.content),
        ['first', 'done', 'second', 'ok', 'third']);
});

test('a reply with no text still goes back while its tool notes are recent', async () => {
    const messages = await buildModelMessages([
        {role: 'user', content: 'first'},
        {role: 'assistant', content: '', taskState: '{"read":"page"}'},
        {role: 'user', content: 'second'},
    ], options);
    assert.equal(messages.length, 3);
    assert.match(messages[1].content, /Earlier tool observations/);
});

test('blank replies and blank messages are never sent', async () => {
    const messages = await buildModelMessages([
        {role: 'user', content: 'go'},
        {role: 'assistant', content: ''},
        {role: 'assistant', content: ' \n'},
        {role: 'user', content: ' '},
        {role: 'user', content: 'again'},
    ], options);
    assert.deepEqual(plain(messages).map(m => m.content), ['go', 'again']);
});

test('whitespace beside an attachment does not become a text block', async () => {
    const [message] = await buildModelMessages([{role: 'user', content: ' ', attachments: [image('a')]}], options);
    assert.deepEqual(plain(message.content).map(part => part.type), ['file']);
});

test('Claude never receives an empty text block after a failed or tool-only reply', async () => {
    const {getModel, MODELPROVIDERS} = createLoader()('src/agent/models/provider.ts');
    const modelId = MODELPROVIDERS.find(p => p.id === 'anthropic').defaultModel;
    let sent;
    const transport = async (_url, init) => {
        sent = JSON.parse(init.body).messages;
        return new Response(JSON.stringify({id: 'msg', type: 'message', role: 'assistant', model: modelId,
            content: [{type: 'text', text: 'ok'}], stop_reason: 'end_turn', stop_sequence: null,
            usage: {input_tokens: 1, output_tokens: 1}}), {headers: {'content-type': 'application/json'}});
    };
    const messages = await buildModelMessages([
        {role: 'user', content: 'first'},
        {role: 'assistant', content: '', taskState: '{"read":"page"}'},
        {role: 'assistant', content: 'done'},
        {role: 'user', content: 'second'},
        {role: 'assistant', content: ''},
        {role: 'user', content: 'second again'},
        {role: 'assistant', content: 'ok'},
        {role: 'user', content: 'third'},
    ], options);
    await generateText({model: getModel('anthropic', 'test-key', modelId, transport), messages});
    const blocks = sent.flatMap(m => m.content).filter(block => block.type === 'text');
    assert.ok(blocks.length > 0);
    assert.deepEqual(blocks.filter(block => !block.text.trim()), []);
});

const {buildEditNote} = createLoader()('src/agent/conversation/editNote.ts');

test('an edited message tells the model what it replaced and what is still on the page', () => {
    const note = buildEditNote('redesign this page\nmake it dark', [
        {role: 'assistant', content: 'Done', toolCalls: [
            {name: 'getPageText', args: {reason: 'Read the page'}, status: 'done'},
            {name: 'evaluateJavaScript', args: {reason: 'Apply a dark stylesheet'}, status: 'done'},
            {name: 'scrollPage', args: {reason: 'Scroll down'}, status: 'done'},
            {name: 'clickTarget', args: {reason: 'Open the menu'}, status: 'error'},
            {name: 'navigateTo', args: {reason: 'Open settings'}, status: 'calling'},
        ]},
    ]);
    assert.match(note, /> redesign this page\n> make it dark/);
    assert.match(note, /- evaluateJavaScript: Apply a dark stylesheet/);
    assert.match(note, /- navigateTo: Open settings \(stopped mid-way; may have partly run\)/);
    assert.doesNotMatch(note, /getPageText|scrollPage|clickTarget/);
    assert.match(note, /Check the page's current state/);
});

test('an edit after read-only turns says the browser is unchanged', () => {
    const note = buildEditNote('summarize', [{role: 'assistant', content: 'Summary', toolCalls: [{name: 'getPageText', status: 'done'}]}]);
    assert.match(note, /Nothing done after the original message changed the browser/);
});

test('the edit note goes ahead of the message, hidden from its text', async () => {
    const [message] = await buildModelMessages([{role: 'user', content: 'make it light', editNote: '[edit note]'}], options);
    assert.equal(message.content, '[edit note]\n\nmake it light');
});

test('editing the first of three messages names the later ones as discarded context', () => {
    const note = buildEditNote('redesign this page', [
        {role: 'assistant', content: 'Done', toolCalls: [{name: 'evaluateJavaScript', args: {reason: 'Apply a redesign'}, status: 'done'}]},
        {role: 'user', content: 'make it\n  dark'},
        {role: 'assistant', content: 'Dark now', toolCalls: [{name: 'evaluateJavaScript', args: {reason: 'Apply a dark stylesheet'}, status: 'done'}]},
        {role: 'user', content: 'bigger font'},
        {role: 'assistant', content: 'Bigger', toolCalls: []},
    ]);
    assert.match(note, /> redesign this page\nThe user's later messages were discarded with it\. They are context only; do not act on them:\n- make it dark\n- bigger font\n/);
    assert.match(note, /- evaluateJavaScript: Apply a redesign\n- evaluateJavaScript: Apply a dark stylesheet/);
});
