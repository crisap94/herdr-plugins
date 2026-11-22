import type { AgentKind, AgentSession, SessionId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';

export type SessionOf = (kind: Text, agentSession: AgentSession) => SessionId | null;

export type AgentSessionOf = (kind: AgentKind, agentSession: AgentSession) => SessionId | null;
