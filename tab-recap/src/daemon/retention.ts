// The daily retention step, composed: the store's retention port, the system clock and the configured days.
import { SystemClock } from '#src/adapters/system-clock.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { sweep } from '#src/recap/application/retention.ts';
import { loadConfig } from './config.ts';

/** One sweep; never throws, so a failing database cannot stop the tick. */
export function forgetClosedTabs(store: Pick<Store, 'retention'>, log: (line: string) => void): void {
    try {
        sweep({ retention: store.retention, clock: new SystemClock(), days: () => loadConfig().keepDays, log });
    } catch (error) {
        log(`retention: ${error instanceof Error ? error.message : String(error)}`);
    }
}
