import type { WindowOf } from '#src/recap/domain/compaction.ts';

export interface ContextWindows {
    readonly sizes: readonly number[];
    windowOf(kind: string): WindowOf;
}
