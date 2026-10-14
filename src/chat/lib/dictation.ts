/** What the user picked in the dictation options menu. Empty means "use the browser's choice". */
export interface DictationSettings {
    deviceId: string;
    lang: string;
}

export const DEFAULT_DICTATION_SETTINGS: DictationSettings = {deviceId: "", lang: ""};

const SETTINGS_KEY = "ts_dictation_settings";

/** Languages offered in the options menu; names come from Intl so they read in the user's own language. */
export const DICTATION_LANGUAGES = [
    "en-US", "en-GB", "en-AU", "en-IN", "en-NG", "es-ES", "es-MX", "fr-FR", "de-DE", "it-IT", "pt-BR", "pt-PT",
    "nl-NL", "pl-PL", "sv-SE", "tr-TR", "ru-RU", "uk-UA", "ar-SA", "hi-IN", "id-ID", "ja-JP", "ko-KR", "zh-CN", "zh-TW",
];

export async function loadDictationSettings(): Promise<DictationSettings> {
    try {
        const stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as Partial<DictationSettings> | undefined;
        return {...DEFAULT_DICTATION_SETTINGS, ...stored};
    } catch {
        return DEFAULT_DICTATION_SETTINGS;
    }
}

export async function saveDictationSettings(settings: DictationSettings) {
    await chrome.storage.local.set({[SETTINGS_KEY]: settings});
}

export function languageName(lang: string, displayIn = "en") {
    try {
        return new Intl.DisplayNames([displayIn], {type: "language"}).of(lang) ?? lang;
    } catch {
        return lang;
    }
}

/** Appends dictated words to what is already typed, with one space between them. */
export function joinTranscript(base: string, addition: string) {
    const words = addition.replace(/\s+/g, " ").trim();
    if (!words) return base;
    if (!base || /\s$/.test(base)) return base + words;
    return `${base} ${words}`;
}

/** Minimal shape of a SpeechRecognitionResultList, so this stays testable outside the browser. */
type ResultList = ArrayLike<ArrayLike<{transcript: string}> & {isFinal: boolean}>;

/** Splits a recognition session's results into the settled words and the guess still being revised. */
export function readResults(results: ResultList) {
    let final = "";
    let interim = "";
    for (let i = 0; i < results.length; i++) {
        const text = results[i][0]?.transcript ?? "";
        if (results[i].isFinal) final += ` ${text}`;
        else interim += ` ${text}`;
    }
    const tidy = (text: string) => text.replace(/\s+/g, " ").trim();
    return {final: tidy(final), interim: tidy(interim)};
}

/**
 * Turns a frame's loudness (RMS of samples in -1..1) into a bar height in 0..1.
 * Quiet rooms sit near -60 dB and speech around -30 to -10 dB, so that range fills the bar.
 */
export function levelFromRms(rms: number) {
    if (!(rms > 0)) return 0;
    const db = 20 * Math.log10(rms);
    return Math.min(1, Math.max(0, (db + 55) / 40));
}

/** What to tell the user for a SpeechRecognition error code; null for ones handled silently. */
export function recognitionErrorMessage(code: string): string | null {
    switch (code) {
        case "no-speech":
        case "aborted":
            return null;
        case "not-allowed":
        case "service-not-allowed":
            return "Microphone access is blocked";
        case "audio-capture":
            return "No microphone found";
        case "network":
            return "Dictation needs an internet connection";
        case "language-not-supported":
            return "That language isn't supported for dictation";
        default:
            return "Dictation stopped unexpectedly";
    }
}
