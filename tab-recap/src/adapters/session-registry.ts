import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { AgentSession, SessionId } from '#src/recap/domain/ids.ts';
import { sessionFromAgentSession } from '#src/recap/domain/session-identity.ts';
import { supported } from '#src/ports/capability.ts';
import type { Capability } from '#src/ports/capability.ts';

const SESSION_OF = {
    claude: supported(sessionFromAgentSession),
    codex: supported(sessionFromAgentSession),
    opencode: supported(sessionFromAgentSession),
} satisfies Readonly<Record<RegisteredKind, Capability<(kind: string, agentSession: AgentSession) => SessionId>>>;

export function sessionOfForKind(kind: string, agentSession: AgentSession): SessionId | null {
    const registered = registeredKindOf(kind);
    if (registered === null) return sessionFromAgentSession(kind, agentSession);
    const capability = SESSION_OF[registered];
    return capability.kind === 'supported' ? capability.value(kind, agentSession) : null;
}
