import type { AgentSession, SessionId } from '#src/recap/domain/ids.ts';

export type SessionOf = (kind: string, agentSession: AgentSession) => SessionId | null;
