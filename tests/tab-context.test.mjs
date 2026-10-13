import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader, plain} from './load-ts.mjs';

test('live context preserves prior snapshots before the signed responses they informed', () => {
    const {createTabContextMessageBuilder} = createLoader()('src/chat/lib/tabContext.ts');
    const build = createTabContextMessageBuilder();
    const initial = [{role: 'user', content: 'Read the page'}];
    const snapshot = {title: 'First page'};
    const first = build(initial, [], snapshot);
    snapshot.title = 'Changed page';
    const assistant = {role: 'assistant', content: [
        {type: 'reasoning', text: 'Plan', providerOptions: {anthropic: {signature: 'signed'}}},
        {type: 'tool-call', toolCallId: 'read', toolName: 'getPageText', input: {}},
    ]};
    const tool = {role: 'tool', content: [{type: 'tool-result', toolCallId: 'read', toolName: 'getPageText',
        output: {type: 'text', value: 'Page'}}]};
    const responses = [assistant, tool];
    const second = build(initial, responses, snapshot);
    assert.deepEqual(plain(second.slice(0, first.length)), plain(first));
    assert.equal(second[first.length], assistant);
    assert.equal(second[first.length + 1], tool);
    assert.match(second[1].content, /First page/);
    const next = {role: 'assistant', content: 'Done'};
    const third = build(initial, [...responses, next], {title: 'Third page'});
    assert.deepEqual(plain(third.slice(0, second.length)), plain(second));
    assert.equal(third[second.length], next);
    assert.equal(initial.length, 1);
    assert.equal(responses.length, 2);
    assert.equal(createTabContextMessageBuilder()(initial, [], {}).length, 2);
});

