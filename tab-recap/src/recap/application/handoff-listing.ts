import type { ClosedLaneRecord, ClosureReader } from '#src/ports/closed-lanes.ts';
import { isUnknown } from '@stateforge-labs/session-ledger';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { Instant } from '@stateforge-labs/session-ledger';

export type ClosedListing = { readonly kind: 'listed'; readonly records: readonly ClosedLaneRecord[] } | { readonly kind: 'unreadable' };

export function listClosedLanes(closures: Pick<ClosureReader, 'listOf'>, tab: ScopeId, now: Instant): ClosedListing {
    const read = closures.listOf(tab, now);
    return isUnknown(read) ? { kind: 'unreadable' } : { kind: 'listed', records: read.records };
}
