import type { HarnessKind, AgentSession, SessionId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';

export type SessionOf = (kind: Text, agentSession: AgentSession) => SessionId | null;

export type AgentSessionOf = (kind: HarnessKind, agentSession: AgentSession) => SessionId | null;
