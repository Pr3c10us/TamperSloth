import {tool} from "ai";
import {z} from "zod";
import {skills, type SkillId} from "@/agent/prompt/skills";

const SKILL_IDS = Object.keys(skills) as [SkillId, ...SkillId[]];

export function createSkillTools() {
    return {
        getSkill: tool({
            description:
                "Read optional reference guidance by skill_id. Fetch only details missing from the current context.",
            inputSchema: z.object({
                skill_id: z
                    .enum(SKILL_IDS)
                    .describe(
                        "Reference topic.",
                    ),
            }),
            execute: async ({skill_id}) => {
                const skill = skills[skill_id];
                if (!skill) {
                    return {
                        ok: false,
                        error: `Unknown skill_id: "${skill_id}". Available: ${Object.keys(skills).join(", ")}`,
                    };
                }
                return {
                    ok: true,
                    skill_id,
                    description: skill.description,
                    content: skill.content,
                };
            },
        }),
    };
}
