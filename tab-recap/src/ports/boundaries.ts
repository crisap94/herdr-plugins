import type { BoundaryKind, Trigger } from '#src/recap/domain/boundary.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
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
    breaksOf(tab: ScopeId): readonly BoundaryBreak[];
    chapterCount(tab: ScopeId): Count;
    lastBreakAt(tab: ScopeId, pane: SessionKey): Instant | null;
}
