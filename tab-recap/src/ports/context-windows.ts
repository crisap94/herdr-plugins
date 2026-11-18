import type { WindowOf } from '#src/recap/domain/compaction.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';

export type { ContextWindows } from './twins/legacy.ts';

export interface ContextWindowLookup {
    windowOf(kind: AgentKind): WindowOf;
}
