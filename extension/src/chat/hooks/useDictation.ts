import { useCallback, useEffect, useRef, useState } from "react";
import { getDraft, updateDraft } from "../lib/drafts";
import {
    joinTranscript,
    levelFromRms,
    readResults,
    recognitionErrorMessage,
    type DictationSettings,
} from "../lib/dictation";

/** The parts of Chrome's (prefixed) SpeechRecognition this uses. */
interface Recognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    /** Chrome can listen to a chosen microphone's track; older versions ignore the argument. */
    start(track?: MediaStreamTrack): void;
    stop(): void;
    abort(): void;
    onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
}

type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | undefined {
    const scope = globalThis as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export type DictationStatus = "idle" | "starting" | "listening" | "stopping" | "permission";

/** How many bars the waveform keeps, and how often a new one is sampled. */
export const WAVE_BARS = 28;
const SAMPLE_MS = 70;
/** Sessions that end this soon after starting, several times in a row, mean the recogniser keeps failing. */
const QUICK_END_MS = 600;
const MAX_QUICK_ENDS = 3;
/** How long a graceful stop may take to deliver the last words before they are taken as heard. */
const STOP_GRACE_MS = 1500;

/** Opens a small window where Chrome can ask for the microphone; side panels cannot show that prompt. */
function openPermissionWindow() {
    const width = 420;
    const height = 380;
    void chrome.windows.create({
        url: chrome.runtime.getURL("index.html#/microphone"),
        type: "popup",
        width,
        height,
        left: Math.max(0, Math.round((screen.availWidth - width) / 2)),
        top: Math.max(0, Math.round((screen.availHeight - height) / 3)),
        focused: true,
    }).catch((error) => console.warn("[Tampersloth] Could not open the microphone window:", error));
}

/**
 * Live dictation into a chat's draft: settled words land in the draft as they are
 * heard, the recogniser's current guess is exposed as `interim`, and the mic's
 * loudness feeds `levels` for the waveform.
 */
export function useDictation(conversationId: string, settings: DictationSettings) {
    const [status, setStatus] = useState<DictationStatus>("idle");
    const [interim, setInterim] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    /** Newest last, each 0..1; read by the waveform every frame rather than re-rendering. */
    const levels = useRef<number[]>(Array(WAVE_BARS).fill(0));

    const statusRef = useRef<DictationStatus>("idle");
    const recognition = useRef<Recognition | null>(null);
    const stream = useRef<MediaStream | null>(null);
    const audio = useRef<AudioContext | null>(null);
    const meterTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    // The chat being dictated into, and its text when the current recognition session began.
    const target = useRef(conversationId);
    const base = useRef("");
    const interimRef = useRef("");
    const sessionStart = useRef(0);
    const quickEnds = useRef(0);
    const stopWaiters = useRef<(() => void)[]>([]);
    const startAfterPermission = useRef(false);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    const setState = (next: DictationStatus) => {
        statusRef.current = next;
        setStatus(next);
    };

    const setInterimText = (text: string) => {
        interimRef.current = text;
        setInterim(text);
    };

    const releaseAudio = () => {
        if (meterTimer.current) clearInterval(meterTimer.current);
        meterTimer.current = null;
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        void audio.current?.close().catch(() => {});
        audio.current = null;
        levels.current = Array(WAVE_BARS).fill(0);
    };

    /** Keeps whatever was still being guessed, then lets go of the mic. */
    const finishSession = () => {
        const leftover = interimRef.current;
        if (leftover) updateDraft(target.current, (d) => ({ ...d, text: joinTranscript(d.text, leftover) }));
        setInterimText("");
        recognition.current = null;
        releaseAudio();
        setState("idle");
        const waiters = stopWaiters.current;
        stopWaiters.current = [];
        waiters.forEach((resolve) => resolve());
    };

    const fail = (message: string) => {
        setNotice(message);
        recognition.current?.abort();
        finishSession();
    };

    const startMeter = (media: MediaStream) => {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(media).connect(analyser);
        audio.current = context;
        const samples = new Float32Array(analyser.fftSize);
        meterTimer.current = setInterval(() => {
            analyser.getFloatTimeDomainData(samples);
            let sum = 0;
            for (const value of samples) sum += value * value;
            levels.current = [...levels.current.slice(1), levelFromRms(Math.sqrt(sum / samples.length))];
        }, SAMPLE_MS);
    };

    /** One recognition session; Chrome ends them on long pauses, so `onend` starts the next while still listening. */
    const listen = (Recognizer: RecognitionConstructor) => {
        const r = new Recognizer();
        r.lang = settingsRef.current.lang || navigator.language || "en-US";
        r.continuous = true;
        r.interimResults = true;
        base.current = getDraft(target.current).text;
        r.onresult = (event) => {
            const { final, interim: guess } = readResults(event.results);
            const text = joinTranscript(base.current, final);
            updateDraft(target.current, (d) => (d.text === text ? d : { ...d, text }));
            setInterimText(guess);
            quickEnds.current = 0;
        };
        r.onerror = (event) => {
            // The mic itself is already granted here, so "not-allowed" means the speech service refused.
            const message = recognitionErrorMessage(event.error);
            if (message) fail(message);
        };
        r.onend = () => {
            if (recognition.current !== r) return;
            // Words still being guessed when a session ends are kept, so a pause never loses them.
            const leftover = interimRef.current;
            if (leftover) {
                updateDraft(target.current, (d) => ({ ...d, text: joinTranscript(d.text, leftover) }));
                setInterimText("");
            }
            if (statusRef.current !== "listening") {
                finishSession();
                return;
            }
            quickEnds.current = Date.now() - sessionStart.current < QUICK_END_MS ? quickEnds.current + 1 : 0;
            if (quickEnds.current >= MAX_QUICK_ENDS) {
                fail("Dictation keeps stopping");
                return;
            }
            listen(Recognizer);
        };
        recognition.current = r;
        sessionStart.current = Date.now();
        const track = settingsRef.current.deviceId ? stream.current?.getAudioTracks()[0] : undefined;
        try {
            if (track) r.start(track);
            else r.start();
        } catch {
            r.start();
        }
    };

    const start = useCallback(async () => {
        if (statusRef.current !== "idle" && statusRef.current !== "permission") return;
        setNotice(null);
        const Recognizer = recognitionClass();
        if (!Recognizer || !navigator.mediaDevices?.getUserMedia) {
            setNotice("Dictation isn't available in this browser");
            return;
        }
        target.current = conversationId;
        startAfterPermission.current = false;
        quickEnds.current = 0;
        setState("starting");
        const { deviceId } = settingsRef.current;
        let media: MediaStream;
        try {
            media = await navigator.mediaDevices.getUserMedia({
                audio: deviceId ? { deviceId: { exact: deviceId } } : true,
            });
        } catch (error) {
            const name = (error as DOMException)?.name;
            if (name === "NotAllowedError" || name === "SecurityError") {
                startAfterPermission.current = true;
                setState("permission");
                openPermissionWindow();
            } else if (name === "NotFoundError" || name === "OverconstrainedError") {
                setState("idle");
                setNotice(deviceId ? "That microphone isn't connected" : "No microphone found");
            } else {
                setState("idle");
                setNotice("Couldn't start the microphone");
            }
            return;
        }
        // Stopped (or the panel moved on) while the mic was opening.
        if ((statusRef.current as DictationStatus) !== "starting") {
            media.getTracks().forEach((track) => track.stop());
            return;
        }
        stream.current = media;
        try {
            startMeter(media);
        } catch { /* The waveform is decoration; dictation still works without it. */ }
        listen(Recognizer);
        if ((statusRef.current as DictationStatus) === "starting") setState("listening");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId]);

    /** Stops listening; resolves once the last words have landed in the draft. */
    const stop = useCallback(() => {
        const current = statusRef.current;
        if (current === "permission") {
            startAfterPermission.current = false;
            setState("idle");
            return Promise.resolve();
        }
        if (current === "idle") return Promise.resolve();
        const done = new Promise<void>((resolve) => stopWaiters.current.push(resolve));
        if (current === "starting" || !recognition.current) {
            finishSession();
            return done;
        }
        setState("stopping");
        const r = recognition.current;
        r.stop();
        setTimeout(() => {
            if (recognition.current !== r) return;
            r.abort();
            finishSession();
        }, STOP_GRACE_MS);
        return done;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Once the microphone window grants access, pick up where the user left off.
    useEffect(() => {
        if (!navigator.permissions?.query) return;
        let permission: PermissionStatus | null = null;
        let live = true;
        const onChange = () => {
            if (permission?.state === "granted" && startAfterPermission.current && statusRef.current === "permission") {
                setState("idle");
                void start();
            } else if (permission?.state === "denied" && statusRef.current === "permission") {
                startAfterPermission.current = false;
                setState("idle");
                setNotice("Microphone access is blocked");
            }
        };
        void navigator.permissions.query({ name: "microphone" as PermissionName }).then((status) => {
            if (!live) return;
            permission = status;
            status.addEventListener("change", onChange);
        }).catch(() => {});
        return () => {
            live = false;
            permission?.removeEventListener("change", onChange);
        };
    }, [start]);

    // Switching chats ends dictation into the old one.
    useEffect(() => {
        if (target.current !== conversationId) void stop();
    }, [conversationId, stop]);

    // The panel closing mid-sentence lets go of the mic.
    useEffect(() => () => {
        recognition.current?.abort();
        recognition.current = null;
        releaseAudio();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), 4000);
        return () => clearTimeout(timer);
    }, [notice]);

    return { status, interim, notice, levels, start, stop };
}
