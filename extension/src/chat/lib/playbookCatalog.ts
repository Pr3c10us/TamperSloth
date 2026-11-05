import {parsePlaybooks, type PlaybookSource} from "./playbooks";

// Separate from playbooks.ts because import.meta.glob only exists under Vite, not the test loader.
const configs = import.meta.glob<string>("../../../playbooks/*/config.json", {query: "?raw", import: "default", eager: true});
const markdowns = import.meta.glob<string>("../../../playbooks/*/playbook.md", {query: "?raw", import: "default", eager: true});

const sources = new Map<string, PlaybookSource>();
const source = (path: string) => {
    const folder = path.split("/").at(-2)!;
    const existing = sources.get(folder) ?? {folder};
    sources.set(folder, existing);
    return existing;
};
for (const [path, config] of Object.entries(configs)) source(path).config = config;
for (const [path, markdown] of Object.entries(markdowns)) source(path).markdown = markdown;

export const playbooks = parsePlaybooks([...sources.values()], error => console.error(`[Tampersloth] Skipped playbook: ${error.message}`));
