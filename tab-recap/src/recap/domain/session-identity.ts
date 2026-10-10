import { sessionId } from './ids.ts';
import type { AgentSession, SessionId } from './ids.ts';

export function sessionFromAgentSession(agentSession: AgentSession): SessionId | null {
    if (agentSession.kind === 'id') {
        return agentSession.value;
    }
    const name = (agentSession.value.split(/[\\/]/u).at(-1) ?? agentSession.value).replace(/\.jsonl$/u, '');
    return name === '' ? null : sessionId(name);
}

export function fallbackSessionIdentity(_kind: string, agentSession: AgentSession): SessionId | null {
    return sessionFromAgentSession(agentSession);
}
