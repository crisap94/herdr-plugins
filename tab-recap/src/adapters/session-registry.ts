import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { AgentSession, SessionId } from '#src/recap/domain/ids.ts';
import { sessionFromAgentSession } from '#src/recap/domain/session-identity.ts';

const SESSION_OF = {
    claude: sessionFromAgentSession,
    codex: sessionFromAgentSession,
    opencode: sessionFromAgentSession,
} satisfies Readonly<Record<RegisteredKind, (kind: string, agentSession: AgentSession) => SessionId>>;

export function sessionOfForKind(kind: string, agentSession: AgentSession): SessionId | null {
    const registered = registeredKindOf(kind);
    return registered === null ? sessionFromAgentSession(kind, agentSession) : SESSION_OF[registered](kind, agentSession);
}
