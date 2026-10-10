import type { WindowOf } from '#src/recap/domain/compaction.ts';

export interface ContextWindows {
    windowOf(kind: string): WindowOf;
}
