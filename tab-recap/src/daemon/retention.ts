import { SystemClock } from '#src/adapters/system-clock.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { forgetClosedTabs as forget } from '#src/recap/application/retention.ts';
import { loadConfig } from './config.ts';

export function forgetClosedTabs(store: Pick<Store, 'retention' | 'closedLanes'>, log: (line: string) => void): void {
    try {
        forget({ retention: store.retention, closures: store.closedLanes, clock: new SystemClock(), days: () => loadConfig().keepDays, log });
    } catch (error) {
        log(`retention: ${error instanceof Error ? error.message : String(error)}`);
    }
}
