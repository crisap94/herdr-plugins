import { sessionIdFromAgentValue } from './ids.ts';
import { textOf } from './text.ts';
import type { AgentSession, SessionId } from './ids.ts';

export function sessionFromAgentSession(agentSession: AgentSession): SessionId {
    if (agentSession.kind === 'id') {
        return agentSession.value;
    }
    const name = (agentSession.value.split(/[\\/]/u).at(-1) ?? agentSession.value).replace(/\.jsonl$/u, '');
    return sessionIdFromAgentValue(textOf(name));
}
