import type { WindowOf } from '#src/recap/domain/compaction.ts';
import type { HarnessKind } from '#src/recap/domain/ids.ts';

export interface ContextWindowLookup {
    windowOf(kind: HarnessKind): WindowOf;
}
