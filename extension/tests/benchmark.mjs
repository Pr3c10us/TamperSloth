import fs from 'node:fs';
import {z} from 'zod';
import {createLoader} from './load-ts.mjs';

const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/context-baseline.json', import.meta.url), 'utf8'));
const load = createLoader({mocks: {'./storage': {}}});
const raw = load('src/chat/lib/tools.ts').createAgentTools({conversationId: 'benchmark'});
const {createToolRuntime} = load('src/chat/lib/toolRuntime.ts');
const {compactToolOutput, compactMessages, serialize} = load('src/chat/lib/efficiency.ts');
const prompt = load('src/chat/lib/prompt.ts').default;
const skills = load('src/chat/lib/skills.ts').skills;
const previousPreamble = baseline.toolDefinitionChars + baseline.systemPromptChars;
const reduction = (before, after) => `${((1 - after / before) * 100).toFixed(1)}%`;

const cases = [
    ['Read a page', 'Summarize this article'],
    ['Research several pages', 'Browse and search for three alternatives'],
    ['Create a script', 'Create a script to hide the banner'],
    ['Debug a script', 'Debug a broken script'],
    ['Modify a script', 'Modify the existing script'],
];
const results = cases.map(([scenario, request]) => {
    const runtime = createToolRuntime(raw, {request, findPrevious: () => undefined});
    const definitionChars = runtime.activeTools().reduce((sum, name) => {
        const t = runtime.tools[name];
        return sum + JSON.stringify({name, description: t.description, parameters: z.toJSONSchema(t.inputSchema, {io: 'input'})}).length;
    }, 0);
    const chars = definitionChars + prompt.length + runtime.initialGuidance.length;
    return {scenario, tools: runtime.activeTools().length, beforeChars: previousPreamble, afterChars: chars, reduction: reduction(previousPreamble, chars)};
});

// Fixed 20-step replay isolates history growth; it does not simulate model choices,
// task quality, pricing, image tokenization, or cache-hit behavior.
const oldMessages = [{role: 'user', content: 'Compare these pages and retain source URLs.'}];
const newMessages = [...oldMessages];
const archived = new Set();
let oldTotal = 0, newTotal = 0;
for (let i = 0; i < 20; i++) {
    oldTotal += previousPreamble + serialize(oldMessages).length;
    newTotal += results[0].afterChars + serialize(compactMessages(newMessages, archived)).length;
    const call = {role: 'assistant', content: [{type: 'tool-call', toolCallId: `read-${i}`, toolName: 'getPageText', input: {selector: 'main'}}]};
    const output = {url: `https://example.com/${i}`, text: 'a'.repeat(10000)};
    oldMessages.push(call, {role: 'tool', content: [{type: 'tool-result', toolCallId: `read-${i}`, toolName: 'getPageText', output: {type: 'json', value: output}}]});
    const projected = compactToolOutput({...output, text: output.text.slice(0, 3000), nextOffset: 3000, truncated: true}, `read-${i}`);
    newMessages.push(call, {role: 'tool', content: [{type: 'tool-result', toolCallId: `read-${i}`, toolName: 'getPageText', output: {type: 'text', value: serialize(projected)}}]});
}
console.log(JSON.stringify({measurement: 'Serialized characters; not live provider token measurements',
    preambles: results,
    skills: {beforeChars: baseline.skillContentChars, afterChars: Object.values(skills).reduce((n, s) => n + s.content.length, 0)},
    fixedReplay: {steps: 20, beforeChars: oldTotal, afterChars: newTotal, reduction: reduction(oldTotal, newTotal), compactedResults: archived.size},
}, null, 2));
