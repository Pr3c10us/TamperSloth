import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader, plain} from './load-ts.mjs';

// A stand-in for chrome.storage.session, enough for the request queue.
function sessionStorage() {
    const data = {};
    return {
        data,
        get: async () => ({...data}),
        set: async (items) => { Object.assign(data, items); },
        remove: async (keys) => { for (const key of keys) delete data[key]; },
    };
}

const load = () => {
    const session = sessionStorage();
    const lib = createLoader({globals: {chrome: {storage: {session}}}})('src/chat/lib/panelRequests.ts');
    return {...lib, session};
};

test('requests are handed over once, oldest first, and only to their own tab', async () => {
    const {queuePanelRequest, takePanelRequests, session} = load();
    await queuePanelRequest(7, {kind: 'quote', text: 'first'});
    await new Promise(resolve => setTimeout(resolve, 2));
    await queuePanelRequest(7, {kind: 'pick'});
    await queuePanelRequest(9, {kind: 'draw'});
    const taken = await takePanelRequests(7);
    assert.deepEqual(plain(taken.map(request => request.kind)), ['quote', 'pick']);
    assert.deepEqual(plain(await takePanelRequests(7)), []);
    assert.equal(Object.keys(session.data).length, 1);
    assert.deepEqual(plain((await takePanelRequests(9)).map(request => request.kind)), ['draw']);
});

test('tab 1 never takes tab 12\'s requests', async () => {
    const {queuePanelRequest, takePanelRequests, hasNewPanelRequest, panelRequestPrefix} = load();
    await queuePanelRequest(12, {kind: 'pick'});
    assert.deepEqual(plain(await takePanelRequests(1)), []);
    const key = `${panelRequestPrefix(12)}1_x`;
    assert.equal(hasNewPanelRequest({[key]: {newValue: {kind: 'pick'}}}, 1), false);
    assert.equal(hasNewPanelRequest({[key]: {newValue: {kind: 'pick'}}}, 12), true);
    // Removing a request is a change too, but not a new one.
    assert.equal(hasNewPanelRequest({[key]: {oldValue: {kind: 'pick'}}}, 12), false);
});
