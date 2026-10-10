import type { AgentSession, SessionId } from '#src/recap/domain/ids.ts';

export type SessionIdentity = (kind: string, agentSession: AgentSession) => SessionId | null;
