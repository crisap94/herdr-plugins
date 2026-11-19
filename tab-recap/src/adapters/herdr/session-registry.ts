import type { AgentSession, SessionId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { sessionOfForKind } from './session-registry/legacy.ts';

export { sessionOfForKind } from './session-registry/legacy.ts';

export const sessionOfKind = (kind: Text, agentSession: AgentSession): SessionId | null => sessionOfForKind(kind, agentSession);
