import type { BoundaryKind, Trigger } from '#src/recap/domain/boundary.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';

export interface BoundaryBreak {
    readonly kind: BoundaryKind;
    readonly at: Instant;
    readonly trigger: Trigger | null;
    readonly tokensBefore: Count | null;
    readonly tokensAfter: Count | null;
    readonly took: Duration | null;
}

export interface BoundaryLog {
    breaksOf(tab: TabId): readonly BoundaryBreak[];
    chapterCount(tab: TabId): Count;
    lastBreakAt(tab: TabId, pane: PaneId): Instant | null;
}
