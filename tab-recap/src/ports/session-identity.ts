import type { AgentKind, AgentSession, SessionId } from '#src/recap/domain/ids.ts';

export type { SessionOf } from './twins/legacy.ts';

export type AgentSessionOf = (kind: AgentKind, agentSession: AgentSession) => SessionId | null;
