import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createLoader, plain} from './load-ts.mjs';

const chat = (id, updatedAt = 1) => ({id, title: 'Chat ' + id, createdAt: 1, updatedAt,
    messages: [{role: 'user', content: 'Hello'}, {role: 'assistant', content: 'Answer', toolCalls: []}]});

function fixture({legacy = [], bytes = 0} = {}) {
    const indexedDB = new IDBFactory();
    const saved = {ts_conversations: legacy};
    const reads = [], writes = [];
    const chrome = {storage: {local: {
        getBytesInUse: async key => { assert.equal(key, 'ts_conversations'); return bytes; },
        get: async key => {
            reads.push(key);
            assert.notEqual(key, null, 'Do not load every storage payload');
            if (key === 'ts_conversations' && bytes > 2 * 1024 * 1024) throw new Error('Unsafe legacy archive read');
            return {[key]: structuredClone(saved[key])};
        },
        getKeys: async () => Object.keys(saved),
        set: async value => { writes.push(value); Object.assign(saved, structuredClone(value)); },
        remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete saved[key]; },
    }}};
    const reload = () => createLoader({globals: {chrome, indexedDB}})('src/chat/lib/storage.ts');
    return {storage: reload(), reload, saved, reads, writes};
}

test('chat history never reads or rewrites the retired archive key or broadcasts transcript changes', async () => {
    const f = fixture({bytes: 300 * 1024 * 1024});
    await Promise.all(Array.from({length: 12}, (_, i) => f.storage.saveConversation(chat('new-' + i, i))));
    assert.deepEqual(f.reads, []);
    assert.deepEqual(f.writes, []);
    const reloaded = f.reload();
    const history = await reloaded.loadConversationHistory();
    assert.equal(history.length, 12);
    assert.equal(history[0].id, 'new-11');
    assert.ok(history.every(c => !('messages' in c)), 'History loads metadata only');
    assert.deepEqual(plain(await reloaded.loadStoredConversation('new-3')), chat('new-3', 3));
    await reloaded.deleteConversation('new-3');
    assert.equal((await reloaded.loadConversationHistory()).length, 11);
    assert.equal(await reloaded.loadStoredConversation('new-3'), null);
    assert.equal(await reloaded.loadStoredConversation('missing'), null);
    assert.deepEqual(f.reads, []);
    assert.deepEqual(f.writes, []);
});

test('failed IndexedDB writes do not leave orphaned history summaries', async () => {
    const f = fixture();
    await assert.rejects(f.storage.saveConversation({...chat('bad'), messages: [() => {}]}));
    assert.equal((await f.storage.loadConversationHistory()).length, 0);
    assert.equal(await f.storage.loadStoredConversation('bad'), null);
    await f.storage.saveConversation(chat('good'));
    assert.equal((await f.storage.loadConversationHistory()).length, 1);
});

test('file listings and deletions use keys without reading the chat archive or file contents', async () => {
    const f = fixture({bytes: 300 * 1024 * 1024});
    f.saved['ts_file:chat/scripts/a.js'] = 'code';
    f.saved['ts_file:chat/lib/b.js'] = 'library';
    f.saved['ts_file:other/scripts/c.js'] = 'other';
    assert.deepEqual(plain(await f.storage.listFiles('chat', 'scripts/')), ['scripts/a.js']);
    assert.equal((await f.storage.listAllCodeFiles()).length, 3);
    await f.storage.deleteAllFilesForConversation('chat');
    assert.deepEqual(plain(await f.storage.listAllCodeFiles()), [{conversationId: 'other', path: 'scripts/c.js'}]);
    assert.deepEqual(f.reads, []);
    assert.ok(Object.hasOwn(f.saved, 'ts_conversations'));
});

test('slow saves coalesce snapshots per conversation without dropping other chats', async () => {
    const {createConversationSaver} = createLoader()('src/chat/lib/conversationSaver.ts');
    const writes = [], errors = [];
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    const enqueue = createConversationSaver(async conversation => {
        writes.push(conversation);
        if (writes.length === 1) await blocked;
        if (conversation.id === 'bad') throw new Error('disk failure');
    }, error => errors.push(error.message));
    enqueue(chat('a', 1));
    for (let i = 2; i < 100; i++) enqueue(chat('a', i));
    enqueue(chat('b', 4));
    enqueue(chat('bad', 5));
    enqueue(chat('c', 6));
    assert.equal(writes.length, 1);
    release();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(writes.map(c => [c.id, c.updatedAt]), [['a', 1], ['a', 99], ['b', 4], ['bad', 5], ['c', 6]]);
    assert.deepEqual(errors, ['disk failure']);
});

test('attachments persist apart from transcripts and are removed with their chat', async () => {
    const f = fixture();
    await f.storage.saveConversation(chat('with-images'));
    await f.storage.saveConversation(chat('other'));
    await f.storage.saveAttachments([
        {id: 'img-1', conversationId: 'with-images', blob: new Blob(['png-bytes'], {type: 'image/png'})},
        {id: 'img-2', conversationId: 'other', blob: new Blob(['other'])},
    ]);
    const reloaded = f.reload();
    const blob = await reloaded.loadAttachment('img-1');
    assert.equal(await blob.text(), 'png-bytes');
    await reloaded.deleteConversation('with-images');
    assert.equal(await reloaded.loadAttachment('img-1'), null);
    assert.ok(await reloaded.loadAttachment('img-2'), 'Other chats keep their attachments');
});
