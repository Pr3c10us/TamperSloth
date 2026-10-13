// Tracks an in-progress walkthrough so a run cannot quietly end by dumping the
// remaining steps as chat text after the on-page observer hiccups.
const GUIDANCE_TOOLS = new Set(['waitForUserAction', 'annotatePage']);
// Give up nudging once recovery keeps failing; the model may then ask about the step.
const MAX_FAILURES = 3;

export const GUIDANCE_RESUME_NOTE = 'Runtime note (not from the user): the walkthrough is still in progress, but your last reply ended it with chat text. ' +
    'That text was not shown. Do not list remaining steps in chat. Resume visual guidance now: inspect the latest page evidence, ' +
    'then call waitForUserAction for the first unfinished step with a fresh selector (or measured region once allowed). ' +
    'If you genuinely need the user\'s help with this specific step, call askUser instead.';

export function createGuidanceGuard() {
    let pending = false, failures = 0, nudges = 0;
    return {
        observe(toolName: string, output: any) {
            if (toolName === 'askUser') {pending = false; return;}
            if (!GUIDANCE_TOOLS.has(toolName) || !output || typeof output !== 'object') return;
            const status = output.status;
            if (status === 'needsReview') {
                if (output.idle) {pending = !output.checkInAllowed; return;}
                if (output.observationPhase !== 'navigated') failures++;
                pending = true;
            } else if (toolName === 'waitForUserAction') {
                // A completed, visually checked, or cancelled step leaves the model free to finish.
                pending = false;
                if (status === 'completed') failures = 0;
            }
        },
        /** Whether text streamed now might be a text-only replacement for guidance. */
        holding: () => pending && failures < MAX_FAILURES && nudges < 2,
        /** Call when a run ended in text while holding; returns true if a resume pass should run. */
        resume() {
            if (!pending || failures >= MAX_FAILURES || nudges >= 2) return false;
            nudges++;
            return true;
        },
    };
}
