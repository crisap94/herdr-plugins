import type { WindowOf } from '#src/recap/domain/compaction.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';

export interface ContextWindowLookup {
    windowOf(kind: AgentKind): WindowOf;
}
