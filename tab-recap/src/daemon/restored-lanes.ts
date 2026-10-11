import type { Observation } from '#src/recap/domain/fold.ts';
import type { LiveLanes } from '#src/ports/tab-views.ts';

export function restoredObservation(source: LiveLanes, log: (line: string) => void): Observation | null {
    const read = source.liveLanes();
    if (read.kind === 'unknown') {
        log(`restored lanes: the persisted lanes could not be read (${read.why.why})`);
        return null;
    }
    return { kind: 'restored', lanes: read.lanes };
}
