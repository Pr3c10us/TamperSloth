import {forwardRef, useEffect, useImperativeHandle, useRef} from "react";
import {basicSetup, EditorView} from "codemirror";
import {indentWithTab} from "@codemirror/commands";
import {javascript} from "@codemirror/lang-javascript";
import {Compartment, EditorState, Prec} from "@codemirror/state";
import {keymap} from "@codemirror/view";
import {oneDark} from "@codemirror/theme-one-dark";
import {useResolvedTheme} from "@/src/settings/lib/theme";

export interface ScriptEditorHandle {
    /** Puts the cursor at this offset and brings it into view. */
    goTo(offset: number): void;
    /** Replaces everything, as when loading a newer saved version. */
    setCode(code: string): void;
}

interface ScriptEditorProps {
    initialCode: string;
    wrap: boolean;
    onChange: (code: string) => void;
    onSave: () => void;
}

const layout = EditorView.theme({
    "&": {fontSize: "13px", backgroundColor: "transparent"},
    "&.cm-focused": {outline: "none"},
    ".cm-scroller": {fontFamily: "var(--font-mono)", lineHeight: "1.65"},
    ".cm-content": {padding: "14px 0 18px"},
    // Opaque, because the numbers stay put while long lines scroll underneath them.
    ".cm-gutters": {backgroundColor: "var(--card)", border: "none"},
});

/** The saved script page's code editor. Loaded on demand, so the gallery doesn't carry it. */
export default forwardRef<ScriptEditorHandle, ScriptEditorProps>(function ScriptEditor({initialCode, wrap, onChange, onSave}, ref) {
    const theme = useResolvedTheme();
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView | null>(null);
    const wrapping = useRef(new Compartment());
    const colors = useRef(new Compartment());
    // The editor outlives renders; these always call the latest handlers.
    const handlers = useRef({onChange, onSave});
    handlers.current = {onChange, onSave};

    useEffect(() => {
        const editor = new EditorView({
            parent: host.current!,
            state: EditorState.create({
                doc: initialCode,
                extensions: [
                    Prec.high(keymap.of([
                        {key: "Mod-s", preventDefault: true, run: () => { handlers.current.onSave(); return true; }},
                        indentWithTab,
                    ])),
                    basicSetup,
                    javascript(),
                    layout,
                    EditorView.contentAttributes.of({"aria-label": "Script code. Press Escape, then Tab, to leave the editor."}),
                    wrapping.current.of(wrap ? EditorView.lineWrapping : []),
                    colors.current.of(theme === "dark" ? oneDark : []),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
                    }),
                ],
            }),
        });
        view.current = editor;
        editor.focus();
        return () => {
            editor.destroy();
            view.current = null;
        };
        // Created once: the code it starts from and the settings below don't recreate it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        view.current?.dispatch({effects: wrapping.current.reconfigure(wrap ? EditorView.lineWrapping : [])});
    }, [wrap]);

    useEffect(() => {
        view.current?.dispatch({effects: colors.current.reconfigure(theme === "dark" ? oneDark : [])});
    }, [theme]);

    useImperativeHandle(ref, () => ({
        goTo(offset) {
            const editor = view.current;
            if (!editor) return;
            editor.dispatch({selection: {anchor: offset}, effects: EditorView.scrollIntoView(offset, {y: "center"})});
            editor.focus();
        },
        setCode(code) {
            const editor = view.current;
            editor?.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: code}, selection: {anchor: 0}});
        },
    }), []);

    return <div ref={host}/>;
});
