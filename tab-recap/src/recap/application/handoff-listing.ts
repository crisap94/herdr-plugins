import type { ClosedLaneRecord, ClosureReader } from '#src/ports/closed-lanes.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export type ClosedListing = { readonly kind: 'listed'; readonly records: readonly ClosedLaneRecord[] } | { readonly kind: 'unreadable' };

export function listClosedLanes(closures: Pick<ClosureReader, 'listOf'>, tab: TabId, now: Instant): ClosedListing {
    const read = closures.listOf(tab, now);
    return isUnknown(read) ? { kind: 'unreadable' } : { kind: 'listed', records: read.records };
}
