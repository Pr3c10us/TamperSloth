import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-ts.mjs';

const fresh = () => createLoader()('src/chat/lib/tabLease.ts');
const settled = async promise => {
    let done = false;
    promise.then(() => { done = true; }, () => { done = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    return done;
};

test('a second chat waits for the tab and gets it when the first run ends', async () => {
    const {acquireTab, releaseTabs, holdsTab} = fresh();
    await acquireTab(7, 'a');
    await acquireTab(7, 'a');
    const waiting = acquireTab(7, 'b');
    assert.equal(await settled(waiting), false);
    releaseTabs('a');
    await waiting;
    assert.equal(holdsTab('b'), true);
    assert.equal(holdsTab('a'), false);
});

test('waiters are served in order, one at a time', async () => {
    const {acquireTab, releaseTabs, holdsTab} = fresh();
    await acquireTab(7, 'a');
    const b = acquireTab(7, 'b');
    const c = acquireTab(7, 'c');
    releaseTabs('a');
    await b;
    assert.equal(await settled(c), false);
    releaseTabs('b');
    await c;
    assert.equal(holdsTab('c'), true);
});

test('stopping a waiting chat leaves the queue', async () => {
    const {acquireTab, releaseTabs, holdsTab} = fresh();
    await acquireTab(7, 'a');
    const controller = new AbortController();
    const b = acquireTab(7, 'b', controller.signal);
    const c = acquireTab(7, 'c');
    controller.abort();
    await assert.rejects(b, {name: 'AbortError'});
    releaseTabs('a');
    await c;
    assert.equal(holdsTab('b'), false);
    assert.equal(holdsTab('c'), true);
});

test('only page tools claim the tab', async () => {
    const {leaseTabTools, holdsTab, acquireTab} = fresh();
    const calls = [];
    const tools = leaseTabTools({
        createFileTool: {execute: async () => calls.push('file')},
        clickElement: {execute: async () => calls.push('click')},
    }, 'b', () => 7);
    await acquireTab(7, 'a');
    await tools.createFileTool.execute({}, {});
    assert.deepEqual(calls, ['file']);
    assert.equal(holdsTab('b'), false);
    const click = tools.clickElement.execute({}, {});
    assert.equal(await settled(click), false);
    assert.deepEqual(calls, ['file']);
});
