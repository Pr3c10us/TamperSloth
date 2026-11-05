import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

// Run the actual TS modules without a new test-runner dependency or emitted files.
// Browser globals and storage are injected; tests never touch a real tab/account.
export function createLoader({globals = {}, mocks = {}} = {}) {
    const cache = new Map();
    const context = vm.createContext({console, URL, URLSearchParams, performance, crypto,
        setTimeout, clearTimeout, Blob, AbortController, DOMException,
        window: {location: {search: '?tabId=7'}},
        chrome: {runtime: {sendMessage: async () => ({ok: true})}}, ...globals});
    function load(filename) {
        filename = path.resolve(filename);
        if (cache.has(filename)) return cache.get(filename).exports;
        const module = {exports: {}};
        cache.set(filename, module);
        const localRequire = id => {
            const isSource = id.startsWith('.') || id.startsWith('@/');
            if (!isSource) return id in mocks ? mocks[id] : require(id);
            let target = id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(filename), id);
            if (!path.extname(target)) target += '.ts';
            // Mocks name the file they replace ('src/storage/scripts.ts'), however it is imported.
            const mockKey = path.relative(process.cwd(), target).replaceAll(path.sep, '/');
            return mockKey in mocks ? mocks[mockKey] : load(target);
        };
        const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
        }).outputText;
        const fn = vm.runInContext(`(function(exports, require, module) {${source}\n})`, context, {filename});
        fn(module.exports, localRequire, module);
        return module.exports;
    }
    return load;
}

export async function invoke(tools, name, input = {}, id = crypto.randomUUID()) {
    const definition = tools[name];
    const parsed = definition.inputSchema.parse(input);
    const output = await definition.execute(parsed, {toolCallId: id, messages: [], abortSignal: new AbortController().signal});
    const projected = definition.toModelOutput ? await definition.toModelOutput({toolCallId: id, input: parsed, output}) : output;
    return {output, projected, id};
}

export const plain = value => JSON.parse(JSON.stringify(value));
