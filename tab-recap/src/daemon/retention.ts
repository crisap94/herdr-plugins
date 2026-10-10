import { SystemClock } from '#src/adapters/system-clock.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { sweep } from '#src/recap/application/retention.ts';
import { loadConfig } from './config.ts';

export function forgetClosedTabs(store: Pick<Store, 'retention'>, log: (line: string) => void): void {
    try {
        sweep({ retention: store.retention, clock: new SystemClock(), days: () => loadConfig().keepDays, log });
    } catch (error) {
        log(`retention: ${error instanceof Error ? error.message : String(error)}`);
    }
}
