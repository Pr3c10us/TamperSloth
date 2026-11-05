import {z} from "zod";
import {TOOL_GROUPS, type Group} from "@/agent/tools/toolRuntime";

/** Written by us and shipped in the extension; see playbooks/README.md for the format. */
export const REQUIRED_SECTIONS = ["Start here", "Avoid", "Fallback", "Done check"];
const MAX_DESCRIPTION_CHARS = 300;

const configSchema = z.strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be kebab-case"),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(MAX_DESCRIPTION_CHARS),
    enabled: z.boolean().default(true),
    tools: z.array(z.enum(Object.keys(TOOL_GROUPS) as [Group, ...Group[]])).default([]),
    lastVerified: z.iso.date(),
});

export type Playbook = z.output<typeof configSchema> & {content: string};
export interface PlaybookSource {folder: string; config?: string; markdown?: string}

/** Throws with the reason a playbook can't be used, so a test can fail on it. */
export function parsePlaybook({folder, config, markdown}: PlaybookSource): Playbook {
    if (!config) throw new Error(`${folder}: missing config.json`);
    if (!markdown) throw new Error(`${folder}: missing playbook.md`);
    let json: unknown;
    try { json = JSON.parse(config); } catch (error) { throw new Error(`${folder}: config.json is not valid JSON: ${(error as Error).message}`); }
    const parsed = configSchema.safeParse(json);
    if (!parsed.success) throw new Error(`${folder}: ${parsed.error.issues.map(issue => `${issue.path.join(".") || "config"} ${issue.message}`).join("; ")}`);
    if (parsed.data.id !== folder) throw new Error(`${folder}: id "${parsed.data.id}" must match the folder name`);
    const headings = new Set([...markdown.matchAll(/^##[ \t]+(.+?)[ \t]*\r?$/gm)].map(match => match[1].toLowerCase()));
    const missing = REQUIRED_SECTIONS.filter(section => !headings.has(section.toLowerCase()));
    if (missing.length) throw new Error(`${folder}: playbook.md is missing ${missing.map(section => `"## ${section}"`).join(", ")}`);
    return {...parsed.data, content: markdown.trim()};
}

/** The enabled playbooks. A broken one is reported and skipped rather than breaking every chat. */
export function parsePlaybooks(sources: PlaybookSource[], onInvalid: (error: Error) => void = () => {}): Playbook[] {
    const playbooks = new Map<string, Playbook>();
    for (const source of sources) {
        try {
            const playbook = parsePlaybook(source);
            if (playbook.enabled) playbooks.set(playbook.id, playbook);
        } catch (error) {
            onInvalid(error as Error);
        }
    }
    return [...playbooks.values()];
}

/** Tool results don't reach later messages, so earlier loads are found from the saved calls. */
export function loadedPlaybookIds(messages: {toolCalls?: {name: string; args?: unknown}[]}[]): Set<string> {
    return new Set(messages.flatMap(message => message.toolCalls ?? [])
        .filter(call => call.name === "loadPlaybook")
        .map(call => (call.args as {id?: string} | undefined)?.id)
        .filter((id): id is string => Boolean(id)));
}

/** Empty when there are no playbooks, so a build without any sends the same prompt as before. */
export function renderPlaybookIndex(playbooks: Playbook[], loadedEarlier: ReadonlySet<string> = new Set()): string {
    if (!playbooks.length) return "";
    const entries = playbooks.map(({id, name, description}) =>
        `- ${id}: ${name}: ${description}${loadedEarlier.has(id) ? " (Loaded earlier in this chat; load it again if this message continues that work.)" : ""}`);
    return `Playbooks are tested processes for specific tasks. Before starting a task, check this list. If a playbook fits, call loadPlaybook before your first page action, then begin with its "Start here" section instead of trying other approaches first. Leave it only through its "Fallback" section or when the user asks. The user's choice between guidance and action, and all safety and confirmation rules, still apply.
${entries.join("\n")}`;
}
