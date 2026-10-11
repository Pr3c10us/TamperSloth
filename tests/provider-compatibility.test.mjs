import test from 'node:test';
import assert from 'node:assert/strict';
import {generateText, streamText, tool, isStepCount} from 'ai';
import {z} from 'zod';
import {createLoader} from './load-ts.mjs';

const load = createLoader();
const {getModel, MODELPROVIDERS} = load('src/chat/lib/provider.ts');
const {agentProviderOptions} = load('src/chat/lib/providerCompatibility.ts');
const {createStepMessagePreparer} = load('src/chat/lib/efficiency.ts');
const {createToolRuntime} = load('src/chat/lib/toolRuntime.ts');

for (const provider of ['openai', 'anthropic', 'google', 'deepseek']) {
    test(`${provider}: canonical image files reach the provider without losing media data`, async () => {
        let request;
        const modelId = MODELPROVIDERS.find(p => p.id === provider).defaultModel;
        const transport = async (_url, init) => {
            request = JSON.parse(init.body);
            const payload = provider === 'anthropic'
                ? {id: 'msg-image', type: 'message', role: 'assistant', model: modelId,
                    content: [{type: 'text', text: 'Done'}], stop_reason: 'end_turn', stop_sequence: null,
                    usage: {input_tokens: 10, output_tokens: 1}}
                : response(provider, modelId, 0, []);
            return new Response(JSON.stringify(payload), {headers: {'content-type': 'application/json'}});
        };
        const result = await generateText({model: getModel(provider, 'test-key', modelId, transport),
            messages: [{role: 'user', content: [{type: 'text', text: 'Inspect this image'},
                {type: 'file', data: 'data:image/png;base64,YQ==', mediaType: 'image/png'}]}]});
        assert.equal(result.text, 'Done');
        const serialized = JSON.stringify(request);
        assert.ok(serialized.includes('YQ=='), 'Provider must receive the original image bytes');
        assert.ok(serialized.includes('image/png'), 'Provider must receive the image media type');
    });
}

function response(provider, model, step, calls) {
    if (provider === 'google') {
        return {candidates: [{content: {role: 'model', parts: [
            {text: 'Plan ' + step, thought: true, thoughtSignature: 'reasoning-' + step},
            ...(calls.length ? calls.map((call, i) => ({functionCall: {name: call.name, args: call.input},
                ...(i === 0 ? {thoughtSignature: 'call-' + step} : {})})) : [{text: 'Done', thoughtSignature: 'final-signature'}]),
        ]}, finishReason: 'STOP'}], usageMetadata: {promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120}};
    }
    if (provider === 'deepseek') {
        return {id: 'completion-' + step, object: 'chat.completion', created: 0, model,
            choices: [{index: 0, finish_reason: calls.length ? 'tool_calls' : 'stop', message: {
                role: 'assistant', content: calls.length ? '' : 'Done',
                ...(step !== 3 ? {reasoning_content: 'Plan ' + step} : {}),
                ...(calls.length ? {tool_calls: calls.map(call => ({id: call.id, type: 'function',
                    function: {name: call.name, arguments: JSON.stringify(call.input)}}))} : {}),
            }}], usage: {prompt_tokens: 100, completion_tokens: 20, total_tokens: 120}};
    }
    return {id: 'response-' + step, model, created_at: 0, status: 'completed',
        output: [{type: 'reasoning', id: 'rs-' + step, encrypted_content: 'encrypted-' + step,
            summary: [{type: 'summary_text', text: 'Plan ' + step}]},
        ...(calls.length ? calls.map(call => ({type: 'function_call', id: 'fc-' + call.id, call_id: call.id,
            name: call.name, arguments: JSON.stringify(call.input)}))
            : [{type: 'message', id: 'msg-' + step, role: 'assistant', phase: 'final_answer',
                content: [{type: 'output_text', text: 'Done', annotations: []}]}])],
        usage: {input_tokens: 100, output_tokens: 20, total_tokens: 120}};
}

function toolHistory(provider, body) {
    if (provider === 'google') {
        return {calls: body.contents.flatMap(m => m.parts.filter(p => p.functionCall).map(p => p.functionCall.name)),
            results: body.contents.flatMap(m => m.parts.filter(p => p.functionResponse).map(p => p.functionResponse.name))};
    }
    if (provider === 'deepseek') {
        return {calls: body.messages.flatMap(m => (m.tool_calls ?? []).map(p => p.id)),
            results: body.messages.filter(m => m.role === 'tool').map(m => m.tool_call_id)};
    }
    return {calls: body.input.filter(p => p.type === 'function_call').map(p => p.call_id),
        results: body.input.filter(p => p.type === 'function_call_output').map(p => p.call_id)};
}

// Exercise the production factory, request options, preparer, runtime, and actual
// SDK serializers for every picker model. The transport is the only mock.
for (const config of MODELPROVIDERS.filter(p => p.id !== 'anthropic')) {
    for (const modelId of config.models) {
        test(`${config.id}/${modelId}: tool expansion, parallel calls and compaction preserve protocol history`, async () => {
            const provider = config.id;
            const archived = new Set();
            const prepare = createStepMessagePreparer(provider, archived);
            const runtime = createToolRuntime({
                askUser: tool({inputSchema: z.object({}), execute: async () => ({answer: 'Yes, send as drafted'})}),
                getPageText: tool({inputSchema: z.object({page: z.number()}), execute: async input => ({page: input.page, text: 'x'.repeat(5500)})}),
                listScripts: tool({inputSchema: z.object({}), execute: async () => ({scripts: []})}),
            }, {request: '', findPrevious: () => undefined});
            const requests = [];
            const transport = async (_url, init) => {
                const body = JSON.parse(init.body);
                const step = requests.length;
                requests.push(body);
                assert.equal(body.model ?? modelId, modelId);
                const history = toolHistory(provider, body);
                assert.deepEqual(history.results, history.calls);
                if (provider === 'deepseek') {
                    assert.equal(body.thinking.type, 'enabled');
                    for (const message of body.messages.filter(m => m.role === 'assistant')) {
                        assert.equal(typeof message.reasoning_content, 'string');
                        for (const call of message.tool_calls ?? []) {
                            const originalStep = Number(call.id.split('-')[1]);
                            assert.equal(message.reasoning_content, originalStep === 3 ? '' : 'Plan ' + originalStep);
                        }
                    }
                } else if (provider === 'google') {
                    const turns = body.contents.filter(m => m.role === 'model');
                    const signatures = turns.flatMap(m => m.parts.filter(p => p.functionCall && p.thoughtSignature).map(p => p.thoughtSignature));
                    assert.deepEqual(signatures, Array.from({length: step}, (_, i) => 'call-' + i));
                    for (const turn of turns.filter(m => m.parts.some(p => p.functionCall))) {
                        assert.match(turn.parts.find(p => p.functionCall).thoughtSignature, /^call-/);
                        assert.ok(turn.parts.some(p => p.thought === true && p.thoughtSignature?.startsWith('reasoning-')));
                    }
                } else {
                    assert.equal(body.store, false);
                    assert.ok(body.include.includes('reasoning.encrypted_content'));
                    assert.ok(body.input.every(item => item.type !== 'item_reference'));
                    assert.deepEqual(body.input.filter(p => p.type === 'reasoning').map(p => p.encrypted_content),
                        Array.from({length: step}, (_, i) => 'encrypted-' + i));
                }
                const calls = step === 0 ? [{id: 'call-0', name: 'enableTools', input: {groups: ['scripting']}}]
                    : step === 1 ? [{id: 'call-1', name: 'askUser', input: {}}]
                        : step < 11 ? [{id: 'call-' + step, name: 'getPageText', input: {page: step}},
                            ...(step === 2 ? [{id: 'parallel-2', name: 'getPageText', input: {page: 99}}] : [])] : [];
                return new Response(JSON.stringify(response(provider, modelId, step, calls)), {headers: {'content-type': 'application/json'}});
            };
            const result = await generateText({model: getModel(provider, 'test-key', modelId, transport),
                messages: [{role: 'user', content: 'Earlier request'}, {role: 'assistant', content: 'Earlier answer'},
                    {role: 'user', content: 'Inspect the approved draft'}],
                tools: runtime.tools, providerOptions: agentProviderOptions(provider, 'balanced'),
                prepareStep: ({initialMessages, responseMessages}) => {
                const messages = [...initialMessages, ...responseMessages];
                    const activeTools = runtime.activeTools();
                    return {messages: prepare(messages, activeTools), activeTools};
                }, stopWhen: isStepCount(15)});
            assert.equal(result.text, 'Done');
            assert.equal(requests.length, 12);
            assert.ok(archived.size > 0, 'The fixture must actually compact tool history');
            assert.ok(JSON.stringify(requests.at(-1)).includes('Yes, send as drafted'));
            assert.ok(!JSON.stringify(requests[0].tools).includes('listScripts'));
            assert.ok(JSON.stringify(requests[1].tools).includes('listScripts'));
        });
    }
}


function streamingResponse(provider, model, step, calls) {
    let events;
    if (provider === 'google') {
        events = [response(provider, model, step, calls)];
    } else if (provider === 'deepseek') {
        events = [{id: 'chunk-' + step, object: 'chat.completion.chunk', created: 0, model, choices: [{index: 0, delta: {
            role: 'assistant', ...(step === 0 ? {reasoning_content: 'Plan'} : {}),
            ...(calls.length ? {tool_calls: calls.map((call, index) => ({index, id: call.id, type: 'function',
                function: {name: call.name, arguments: JSON.stringify(call.input)}}))} : {content: 'Done'}),
        }, finish_reason: null}]}, {id: 'chunk-' + step, object: 'chat.completion.chunk', created: 0, model,
            choices: [{index: 0, delta: {}, finish_reason: calls.length ? 'tool_calls' : 'stop'}],
            usage: {prompt_tokens: 100, completion_tokens: 20, total_tokens: 120}}];
    } else {
        events = [{type: 'response.created', response: {id: 'response-' + step, created_at: 0, model}},
            {type: 'response.output_item.added', output_index: 0,
                item: {type: 'reasoning', id: 'rs-' + step, encrypted_content: 'partial'}},
            {type: 'response.reasoning_summary_text.delta', item_id: 'rs-' + step, summary_index: 0, delta: 'Plan'},
            {type: 'response.output_item.done', output_index: 0,
                item: {type: 'reasoning', id: 'rs-' + step, encrypted_content: 'complete-' + step}},
        ];
        for (const call of calls) {
            const item = {type: 'function_call', id: 'fc-' + call.id, call_id: call.id, name: call.name,
                arguments: JSON.stringify(call.input), status: 'completed'};
            events.push({type: 'response.output_item.added', output_index: 1, item: {...item, arguments: ''}},
                {type: 'response.function_call_arguments.delta', item_id: item.id, output_index: 1, delta: item.arguments},
                {type: 'response.output_item.done', output_index: 1, item});
        }
        if (!calls.length) events.push({type: 'response.output_item.added', output_index: 1,
            item: {type: 'message', id: 'msg-' + step, phase: 'final_answer'}},
        {type: 'response.output_text.delta', item_id: 'msg-' + step, output_index: 1, content_index: 0, delta: 'Done'});
        events.push({type: 'response.completed', response: {usage: {input_tokens: 100, output_tokens: 20}}});
    }
    return new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''),
        {headers: {'content-type': 'text/event-stream'}});
}

for (const provider of ['openai', 'google', 'deepseek']) {
    test(`${provider}: streaming completes reasoning metadata before the next tool step`, async () => {
        const modelId = MODELPROVIDERS.find(p => p.id === provider).defaultModel;
        const requests = [];
        const runtime = createToolRuntime({
            getPageText: tool({inputSchema: z.object({}), execute: async () => ({text: 'Page'})}),
            listScripts: tool({inputSchema: z.object({}), execute: async () => ({scripts: []})}),
        }, {request: '', findPrevious: () => undefined});
        const prepare = createStepMessagePreparer(provider, new Set());
        const transport = async (_url, init) => {
            const body = JSON.parse(init.body);
            const step = requests.length;
            requests.push(body);
            assert.equal(body.stream ?? true, true);
            const history = toolHistory(provider, body);
            assert.deepEqual(history.results, history.calls);
            if (provider === 'google') {
                assert.deepEqual(body.contents.flatMap(m => m.parts.filter(p => p.functionCall && p.thoughtSignature).map(p => p.thoughtSignature)),
                    Array.from({length: step}, (_, i) => 'call-' + i));
            } else if (provider === 'openai') {
                assert.equal(body.store, false);
                assert.deepEqual(body.input.filter(p => p.type === 'reasoning').map(p => p.encrypted_content),
                    Array.from({length: step}, (_, i) => 'complete-' + i));
                assert.ok(body.input.every(p => p.type !== 'item_reference'));
            } else {
                const turns = body.messages.filter(m => m.role === 'assistant');
                assert.deepEqual(turns.map(m => m.reasoning_content), ['Plan', ''].slice(0, step));
            }
            const calls = step === 0 ? [{id: 'enable', name: 'enableTools', input: {groups: ['scripting']}}]
                : step === 1 ? [{id: 'read', name: 'getPageText', input: {}}] : [];
            return streamingResponse(provider, modelId, step, calls);
        };
        const result = streamText({model: getModel(provider, 'test-key', modelId, transport), prompt: 'Inspect the page',
            tools: runtime.tools, providerOptions: agentProviderOptions(provider, 'balanced'),
            prepareStep: ({initialMessages, responseMessages}) => {
                const messages = [...initialMessages, ...responseMessages];
                const activeTools = runtime.activeTools();
                return {messages: prepare(messages, activeTools), activeTools};
            }, stopWhen: isStepCount(5)});
        for await (const event of result.stream) if (event.type === 'error') throw event.error;
        assert.equal(await result.text, 'Done');
        assert.equal(requests.length, 3);
    });
}
