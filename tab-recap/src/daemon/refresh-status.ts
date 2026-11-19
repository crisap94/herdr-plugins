import { boundedBy } from './bounded.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import { refreshStatusOf } from '#src/recap/domain/freshness.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Duration } from '#src/recap/domain/time.ts';

export { refreshedWithin } from './legacy.ts';

export async function refreshWithin(run: Promise<void>, records: Pick<RecapRecords, 'readRecap'>, tab: TabId, limit: Duration): Promise<RefreshStatus> {
    return refreshStatusOf(await boundedBy(run, limit), records.readRecap(tab)?.error ?? null);
}
