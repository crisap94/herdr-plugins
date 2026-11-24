import type { HarnessKind, AgentSession, SessionId } from '#src/recap/domain/ids.ts';
import type { Text } from '@stateforge-labs/session-ledger';

export type SessionOf = (kind: Text, agentSession: AgentSession) => SessionId | null;

export type AgentSessionOf = (kind: HarnessKind, agentSession: AgentSession) => SessionId | null;
