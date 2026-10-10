import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { AgentSession, SessionId } from '#src/recap/domain/ids.ts';
import { claudeSessionOf } from './claude-session.ts';
import { codexSessionOf } from './codex-session.ts';
import { opencodeSessionOf } from './opencode-session.ts';
import { sessionFromAgentSession } from '#src/recap/domain/session-identity.ts';

const SESSION_OF = {
    claude: claudeSessionOf,
    codex: codexSessionOf,
    opencode: opencodeSessionOf,
} satisfies Readonly<Record<RegisteredKind, (agentSession: AgentSession) => SessionId | null>>;

function unregisteredSessionOf(agentSession: AgentSession): SessionId | null {
    return sessionFromAgentSession(agentSession);
}

export function sessionOfForKind(kind: string, agentSession: AgentSession): SessionId | null {
    const registered = registeredKindOf(kind);
    return registered === null ? unregisteredSessionOf(agentSession) : SESSION_OF[registered](agentSession);
}
