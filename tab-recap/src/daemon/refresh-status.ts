import { knownOr, type GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import { boundedBy } from './bounded.ts';
import { refreshStatusOf } from '#src/recap/domain/freshness.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { duration, type Duration } from '#src/recap/domain/time.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { RECAP_WAIT_MS, type RecapRefresh } from '#src/recap/application/recap-wait.ts';

export async function refreshWithin(run: Promise<void>, records: Pick<GuardedRecapRecords, 'readRecap'>, tab: TabId, limit: Duration): Promise<RefreshStatus> {
    return refreshStatusOf(await boundedBy(run, limit), knownOr(records.readRecap(tab), null)?.error ?? null);
}

export function refreshVia(recaps: Pick<TabRecaps, 'refresh'>, records: Pick<GuardedRecapRecords, 'readRecap'>): RecapRefresh {
    return (tab: TabId, lanes: readonly Lane[]): Promise<RefreshStatus> => refreshWithin(recaps.refresh(tab, lanes), records, tab, duration(RECAP_WAIT_MS));
}
