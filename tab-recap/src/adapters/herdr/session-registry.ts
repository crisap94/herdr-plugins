import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { AgentSession, SessionId } from '#src/recap/domain/ids.ts';
import { sessionFromAgentSession } from '#src/recap/domain/session-identity.ts';
import { supported } from '#src/ports/capability.ts';
import type { Support } from '#src/ports/capability.ts';
import type { Text } from '#src/recap/domain/text.ts';

const SESSION_OF = {
    claude: supported(sessionFromAgentSession),
    codex: supported(sessionFromAgentSession),
    opencode: supported(sessionFromAgentSession),
} satisfies Readonly<Record<RegisteredKind, Support<(agentSession: AgentSession) => SessionId | null, never>>>;

export function sessionOfForKind(kind: Text, agentSession: AgentSession): SessionId | null {
    const registered = registeredKindOf(kind);
    if (registered === null) return sessionFromAgentSession(agentSession);
    const capability = SESSION_OF[registered];
    return capability.kind === 'supported' ? capability.value(agentSession) : null;
}
