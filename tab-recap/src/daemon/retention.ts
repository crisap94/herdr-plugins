import { SystemClock } from '#src/adapters/os/system-clock.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { forgetClosedTabs as forget } from '#src/recap/application/retention.ts';
import { loadSettings } from './config.ts';
import { parseLine, type Line } from './slots.ts';

export function forgetClosedTabs(store: Pick<Store, 'retention' | 'closedLanes'>, log: (line: Line) => void): void {
    try {
        forget({ retention: store.retention, closures: store.closedLanes, clock: new SystemClock(), days: () => loadSettings().keepDays, log: parseLineSink.bind(undefined, log) });
    } catch (error) {
        log(parseLine(`retention: ${error instanceof Error ? error.message : String(error)}`));
    }
}

export type LineSink = (line: Line) => void;

export function parseLineSink(log: LineSink, line: unknown): Line {
    const parsed = parseLine(line);
    log(parsed);
    return parsed;
}
