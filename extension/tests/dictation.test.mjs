import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader, plain} from './load-ts.mjs';

const load = (local = {}) => {
    const stored = {...local};
    const chrome = {storage: {local: {
        get: async key => (key in stored ? {[key]: stored[key]} : {}),
        set: async items => { Object.assign(stored, items); },
    }}};
    return {...createLoader({globals: {chrome, Intl}})('src/chat/lib/dictation.ts'), stored};
};

// A stand-in for SpeechRecognitionResultList: each result holds its best guess first.
const results = (...items) => items.map(([transcript, isFinal]) => Object.assign([{transcript}], {isFinal}));

test('dictated words join what is typed with a single space', () => {
    const {joinTranscript} = load();
    assert.equal(joinTranscript('', 'hello there'), 'hello there');
    assert.equal(joinTranscript('Let us add', '  dictation  to it '), 'Let us add dictation to it');
    assert.equal(joinTranscript('Line one\n', 'line two'), 'Line one\nline two');
    assert.equal(joinTranscript('Ends with space ', 'more'), 'Ends with space more');
    assert.equal(joinTranscript('Unchanged', '   '), 'Unchanged');
});

test('settled words and the live guess are read apart', () => {
    const {readResults} = load();
    assert.deepEqual(plain(readResults(results(['Let us add', true], [' dictation to', true], [' tampersloth and I', false]))),
        {final: 'Let us add dictation to', interim: 'tampersloth and I'});
    assert.deepEqual(plain(readResults(results(['okay', false]))), {final: '', interim: 'okay'});
    assert.deepEqual(plain(readResults([])), {final: '', interim: ''});
});

test('loudness maps silence to a dot and speech to a full bar', () => {
    const {levelFromRms} = load();
    assert.equal(levelFromRms(0), 0);
    assert.equal(levelFromRms(NaN), 0);
    assert.equal(levelFromRms(0.0005), 0);
    assert.ok(levelFromRms(0.03) > 0.3 && levelFromRms(0.03) < 0.8);
    assert.equal(levelFromRms(0.8), 1);
    assert.ok(levelFromRms(0.01) < levelFromRms(0.05));
});

test('pauses and cancels stay quiet; real failures explain themselves', () => {
    const {recognitionErrorMessage} = load();
    assert.equal(recognitionErrorMessage('no-speech'), null);
    assert.equal(recognitionErrorMessage('aborted'), null);
    assert.match(recognitionErrorMessage('network'), /internet/);
    assert.match(recognitionErrorMessage('audio-capture'), /microphone/);
    assert.ok(recognitionErrorMessage('something-new'));
});

test('options fall back to the browser defaults and round-trip through storage', async () => {
    const {loadDictationSettings, saveDictationSettings} = load();
    assert.deepEqual(plain(await loadDictationSettings()), {deviceId: '', lang: ''});
    await saveDictationSettings({deviceId: 'mic-2', lang: 'fr-FR'});
    assert.deepEqual(plain(await loadDictationSettings()), {deviceId: 'mic-2', lang: 'fr-FR'});
    const partial = load({ts_dictation_settings: {lang: 'de-DE'}});
    assert.deepEqual(plain(await partial.loadDictationSettings()), {deviceId: '', lang: 'de-DE'});
});

test('language names come from Intl, with the code as a fallback', () => {
    const {languageName} = load();
    assert.equal(languageName('fr-FR', 'en'), 'French (France)');
    assert.equal(languageName('not a code!', 'en'), 'not a code!');
});
