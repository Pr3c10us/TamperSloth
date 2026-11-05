import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sources = fs.readdirSync('src', {recursive: true}).map(file => file.replaceAll('\\', '/'))
    .filter(file => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'));

const importsOf = file => [...fs.readFileSync(`src/${file}`, 'utf8')
    .matchAll(/^(?:import|export)\s+(type\s+)?[^;'"]*?from\s+["']([^"']+)["']/gm)]
    .map(([, typeOnly, from]) => ({typeOnly: Boolean(typeOnly), from}));

test('code injected into web pages imports nothing', () => {
    // These functions are serialized with toString(): an imported helper would be undefined in the page.
    for (const file of sources.filter(file => file.startsWith('injected/'))) {
        const values = importsOf(file).filter(({typeOnly}) => !typeOnly);
        assert.deepEqual(values, [], file);
    }
});

test('dependencies only point one way', () => {
    const forbidden = {
        agent: ['background', 'pages', 'ui'],
        background: ['pages', 'ui'],
        storage: ['background', 'pages', 'ui'],
        account: ['background', 'pages', 'ui'],
        userscripts: ['background', 'pages', 'ui'],
        shared: ['agent', 'background', 'pages', 'ui', 'storage', 'account', 'userscripts', 'injected'],
        ui: ['agent', 'background', 'pages', 'storage', 'account', 'userscripts', 'injected'],
    };
    for (const file of sources) {
        const banned = forbidden[file.split('/')[0]] ?? [];
        for (const {from} of importsOf(file)) {
            const target = from.startsWith('@/') ? from.slice(2).split('/')[0] : null;
            assert.ok(!banned.includes(target), `${file} must not import ${from}`);
        }
    }
});
