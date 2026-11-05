import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLoader, plain} from './load-ts.mjs';

function setup() {
    const load = createLoader({mocks: {'src/storage/storage.ts': {}}});
    const bus = load('src/agent/tools/askUserBus.ts');
    const {askUser} = load('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'test'});
    return {bus, askUser};
}

const question = options => ({question: 'Which direction?', options});

test('option descriptions reach the question card', async () => {
    const {bus, askUser} = setup();
    const input = askUser.inputSchema.parse(question([{label: 'Direction A', description: 'Dark, dense and technical.'}, {label: 'Direction B'}]));
    const asked = askUser.execute(input, {toolCallId: 'q1', messages: []});
    assert.deepEqual(plain(bus.getPendingAsk('test').options), [{label: 'Direction A', description: 'Dark, dense and technical.'}, {label: 'Direction B'}]);
    bus.answerPendingAsk('test', {label: 'Direction A', custom: false});
    assert.deepEqual(plain(await asked), {answer: {label: 'Direction A', custom: false}});
});

test('descriptions up to the limit are accepted and longer ones are rejected', () => {
    const {askUser} = setup();
    const withDescription = length => question([{label: 'A', description: 'x'.repeat(length)}, {label: 'B'}]);
    assert.ok(askUser.inputSchema.safeParse(withDescription(120)).success);
    assert.ok(!askUser.inputSchema.safeParse(withDescription(121)).success);
});

test('bare string options still work', () => {
    const {askUser} = setup();
    assert.ok(askUser.inputSchema.safeParse(question(['Yes', 'No'])).success);
});

test('the question card wraps options instead of cutting them off', () => {
    const overlay = fs.readFileSync('src/pages/chat/prompts/AskUserOverlay.tsx', 'utf8');
    assert.ok(!/\btruncate\b|line-clamp/.test(overlay));
    assert.match(overlay, /overflow-y-auto/);
});

test('the UI playbook tells the model to describe each direction', () => {
    const playbook = fs.readFileSync('playbooks/ui-design/playbook.md', 'utf8');
    assert.match(playbook, /`description`/);
    assert.match(playbook, /under 80 characters/);
});
