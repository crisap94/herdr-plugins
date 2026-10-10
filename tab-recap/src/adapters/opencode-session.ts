import type { AgentSession, SessionId } from '#src/recap/domain/ids.ts';
import { sessionFromAgentSession } from '#src/recap/domain/session-identity.ts';

export function opencodeSessionOf(agentSession: AgentSession): SessionId | null {
    return sessionFromAgentSession(agentSession);
}
