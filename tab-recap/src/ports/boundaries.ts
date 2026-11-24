import type { BoundaryKind, Trigger } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import type { Duration, Instant } from '@stateforge-labs/session-ledger';

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
