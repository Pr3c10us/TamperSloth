import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tool} from 'ai';
import {z} from 'zod';
import {createLoader, invoke, plain} from './load-ts.mjs';

const load = createLoader();
const {parsePlaybook, parsePlaybooks, renderPlaybookIndex, loadedPlaybookIds} = load('src/agent/prompt/playbooks.ts');
const {createToolRuntime} = load('src/agent/tools/toolRuntime.ts');
const {compactMessages} = load('src/agent/run/contextCompaction.ts');

function readSource(root, folder) {
    const read = name => {
        const file = path.join(root, folder, name);
        return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
    };
    return {folder, config: read('config.json'), markdown: read('playbook.md')};
}

const sample = readSource('tests/fixtures/playbooks', 'sample-playbook');
const sampleConfig = JSON.parse(sample.config);
const withConfig = changes => ({...sample, config: JSON.stringify({...sampleConfig, ...changes})});
const playbook = (changes = {}) => parsePlaybook(withConfig(changes));
const runtimeWith = (playbooks, request = 'Summarize this article') => {
    const raw = {getCurrentTab: tool({inputSchema: z.object({}), execute: async () => ({})})};
    return createToolRuntime(raw, {request, findPrevious: () => undefined, playbooks});
};

test('every shipped playbook is valid, with unique ids', () => {
    const folders = fs.readdirSync('playbooks', {withFileTypes: true}).filter(entry => entry.isDirectory()).map(entry => entry.name);
    // parsePlaybook requires each id to match its folder, and folder names are unique.
    for (const folder of folders) parsePlaybook(readSource('playbooks', folder));
});

test('code in shipped playbooks parses, and the 3D kit does not trigger the secrets approval', () => {
    const AsyncFunction = (async () => {}).constructor;
    const {assessAction} = load('src/agent/safety/actionScreen.ts');
    for (const folder of fs.readdirSync('playbooks', {withFileTypes: true}).filter(entry => entry.isDirectory()).map(entry => entry.name)) {
        const markdown = fs.readFileSync(path.join('playbooks', folder, 'playbook.md'), 'utf8');
        const blocks = [...markdown.matchAll(/```js[^\n]*\r?\n([\s\S]*?)```/g)].map(match => match[1]);
        for (const code of blocks) new AsyncFunction(code);
    }
    const markdown = fs.readFileSync('playbooks/web-3d/playbook.md', 'utf8');
    const kit = markdown.match(/```js kit\r?\n([\s\S]*?)```/)[1];
    const script = `async function add3d() {\n${kit}\n}`;
    assert.equal(assessAction('executeContentScript', {path: 'scripts/x.js'}, [], script).confirm, undefined);
    assert.match(script, /^async function add3d\(/, 'the runner calls the first named function');
    assert.ok(kit.includes('three@0.187.0'), 'the library version stays pinned');
});

test('3D recipes add no visible buttons by default', () => {
    const markdown = fs.readFileSync('playbooks/web-3d/playbook.md', 'utf8');
    for (const [, name, code] of markdown.matchAll(/```js ([\w-]+)\r?\n([\s\S]*?)```/g)) {
        if (name !== 'kit') assert.doesNotMatch(code, /s\.button\(|views:|loop: true/, name);
    }
    assert.doesNotMatch(markdown, /s\.button\('(?:Rotate|Pause)/);
});

test('the UI playbook uses the image library the way scripts must', () => {
    const config = JSON.parse(fs.readFileSync('playbooks/ui-design/config.json', 'utf8'));
    assert.ok(config.tools.includes('images'));
    const markdown = fs.readFileSync('playbooks/ui-design/playbook.md', 'utf8');
    const place = markdown.match(/```js image-place\r?\n([\s\S]*?)```/)[1];
    // Exports only pack images a script names literally, so the helper takes a handle, never a name.
    assert.match(place, /MH_getImage\('[\w.-]+'\)/);
    assert.doesNotMatch(place, /MH_getImage\([a-zA-Z_$]/);
    assert.match(place, /\.objectUrl\(\)/);
    assert.match(place, /\.bitmap\(\)/);
});

test('a valid playbook parses, and optional fields get defaults', () => {
    const parsed = parsePlaybook(sample);
    assert.equal(parsed.id, 'sample-playbook');
    assert.equal(parsed.enabled, true);
    assert.deepEqual(plain(parsed.tools), ['scripting']);
    assert.ok(parsed.content.startsWith('## Start here'));
    const {tools: _tools, ...withoutTools} = sampleConfig;
    assert.deepEqual(plain(parsePlaybook({...sample, config: JSON.stringify(withoutTools)}).tools), []);
});

test('invalid playbooks are rejected with the reason', () => {
    const cases = [
        [{...sample, config: undefined}, /missing config\.json/],
        [{...sample, markdown: undefined}, /missing playbook\.md/],
        [{...sample, config: '{nope'}, /not valid JSON/],
        [withConfig({id: 'other-name'}), /must match the folder name/],
        [withConfig({id: 'Not Kebab'}), /kebab-case/],
        [withConfig({description: ''}), /description/],
        [withConfig({description: 'x'.repeat(301)}), /description/],
        [withConfig({tools: ['notAGroup']}), /tools/],
        [withConfig({lastVerified: 'recently'}), /lastVerified/],
        [withConfig({extra: true}), /extra|config/],
        [{...sample, markdown: sample.markdown.replace('## Fallback', '## Other')}, /"## Fallback"/],
    ];
    for (const [source, reason] of cases) assert.throws(() => parsePlaybook(source), reason);
});

test('section headings tolerate Windows line endings and different case', () => {
    const markdown = sample.markdown.replaceAll('\n', '\r\n').replace('Start here', 'START HERE');
    assert.equal(parsePlaybook({...sample, markdown}).id, 'sample-playbook');
});

test('the catalog drops disabled playbooks and reports broken ones without failing', () => {
    const errors = [];
    const parsed = parsePlaybooks([
        sample,
        {...withConfig({id: 'disabled-one', enabled: false}), folder: 'disabled-one'},
        {folder: 'broken-one'},
    ], error => errors.push(error.message));
    assert.deepEqual(plain(parsed.map(item => item.id)), ['sample-playbook']);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /broken-one/);
});

test('the index lists every playbook and is empty without any', () => {
    assert.equal(renderPlaybookIndex([]), '');
    const index = renderPlaybookIndex([playbook()]);
    assert.ok(index.includes('- sample-playbook: Sample playbook: Use when testing the playbook system.'));
    assert.ok(index.includes('loadPlaybook'));
    assert.ok(!index.includes('Loaded earlier'));
});

test('playbooks loaded in earlier messages are marked in the index', () => {
    const ids = loadedPlaybookIds([
        {role: 'user'},
        {role: 'assistant', toolCalls: [{name: 'getSkill', args: {skill_id: 'script_format'}}, {name: 'loadPlaybook', args: {id: 'sample-playbook'}}]},
        {role: 'assistant', toolCalls: [{name: 'loadPlaybook', args: {}}]},
    ]);
    assert.deepEqual([...ids], ['sample-playbook']);
    assert.ok(renderPlaybookIndex([playbook()], ids).includes('Loaded earlier in this chat'));
});

test('without playbooks the tool is absent and active tools are unchanged', () => {
    const without = createToolRuntime({}, {request: 'Summarize this article', findPrevious: () => undefined});
    const empty = runtimeWith([]);
    assert.ok(!without.tools.loadPlaybook);
    assert.ok(!empty.activeTools().includes('loadPlaybook'));
});

test('loadPlaybook returns the whole playbook, adds its tools and removes none', async () => {
    const content = `## Start here\n${'Long instructions. '.repeat(1000)}\n## Avoid\nx\n## Fallback\ny\n## Done check\nz`;
    assert.ok(content.length > 6000);
    const runtime = runtimeWith([{...playbook(), content}]);
    assert.ok(runtime.activeTools().includes('loadPlaybook'));
    const before = runtime.activeTools();
    const {output, projected} = await invoke(runtime.tools, 'loadPlaybook', {id: 'sample-playbook'});
    assert.equal(output.content, content);
    assert.equal(output.lastVerified, '2026-11-02');
    assert.deepEqual(plain(output.enabled), ['scripting']);
    assert.ok(output.guidance[0].includes('Script workflow'));
    assert.ok(projected.value.includes('## Done check'), 'the model receives the whole playbook');
    for (const name of before) assert.ok(runtime.activeTools().includes(name));
});

test('loadPlaybook keeps tool groups the request already enabled', async () => {
    const runtime = runtimeWith([playbook({tools: ['scripting']})], 'Add the hoodie to my cart');
    assert.ok(runtime.initialGroups.includes('browsing'));
    const {output} = await invoke(runtime.tools, 'loadPlaybook', {id: 'sample-playbook'});
    assert.ok(output.enabled.includes('browsing'));
    assert.ok(output.enabled.includes('input'));
});

test('a repeat load in the same run does not resend the playbook', async () => {
    const runtime = runtimeWith([playbook()]);
    await invoke(runtime.tools, 'loadPlaybook', {id: 'sample-playbook'});
    const {output} = await invoke(runtime.tools, 'loadPlaybook', {id: 'sample-playbook'});
    assert.equal(output.alreadyLoaded, 'sample-playbook');
    assert.equal(output.content, undefined);
});

test('a loaded playbook survives compaction in a long run', () => {
    const big = 'x'.repeat(60000);
    const result = (id, toolName) => ({role: 'tool', content: [{type: 'tool-result', toolCallId: id, toolName, output: {type: 'text', value: big}}]});
    const messages = [result('load', 'loadPlaybook'), result('old', 'getPageText'),
        ...['a', 'b', 'c'].map(id => result(id, 'getPageText'))];
    const compacted = compactMessages(messages, new Set());
    assert.equal(compacted[0].content[0].output.value, big);
    assert.notEqual(compacted[1].content[0].output.value, big);
});

test('loadPlaybook is treated as read-only and is not scanned as page content', () => {
    for (const file of ['agent/safety/actionScreen', 'agent/safety/safetyGate', 'pages/chat/messages/stepSummary', 'pages/chat/messages/toolMeta']) {
        assert.ok(fs.readFileSync(`src/${file}.ts`, 'utf8').includes('loadPlaybook'), file);
    }
});
