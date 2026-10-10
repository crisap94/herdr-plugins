import { sessionIdFromAgentValue } from './ids.ts';
import type { AgentSession, SessionId } from './ids.ts';

export function sessionFromAgentSession(_kind: string, agentSession: AgentSession): SessionId {
    if (agentSession.kind === 'id') {
        return agentSession.value;
    }
    const name = (agentSession.value.split(/[\\/]/u).at(-1) ?? agentSession.value).replace(/\.jsonl$/u, '');
    return sessionIdFromAgentValue(name);
}
