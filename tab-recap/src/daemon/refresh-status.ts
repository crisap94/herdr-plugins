import { bounded } from './bounded.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import { refreshStatusOf } from '#src/recap/domain/freshness.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';

export async function refreshedWithin(run: Promise<void>, records: Pick<RecapRecords, 'readRecap'>, tab: string, ms: number): Promise<RefreshStatus> {
    return refreshStatusOf(await bounded(run, ms), records.readRecap(tab)?.error ?? null);
}
