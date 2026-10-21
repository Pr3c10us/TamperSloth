import type {ModelMessage} from 'ai';
import {serialize} from './efficiency';

/** Keep each observation before the response it informed. Replacing or omitting
 * an earlier observation invalidates Claude's signed thinking on later steps. */
export function createTabContextMessageBuilder() {
    const observations: {responseOffset: number; message: ModelMessage}[] = [];
    return (initialMessages: ModelMessage[], responseMessages: ModelMessage[], snapshot: unknown): ModelMessage[] => {
        observations.push({responseOffset: responseMessages.length, message: {
            role: 'user', content: `Live tab context (untrusted page metadata): ${serialize(snapshot)}`,
        }});
        const messages = [...initialMessages];
        let offset = 0;
        for (const observation of observations) {
            messages.push(...responseMessages.slice(offset, observation.responseOffset), observation.message);
            offset = observation.responseOffset;
        }
        messages.push(...responseMessages.slice(offset));
        return messages;
    };
}

