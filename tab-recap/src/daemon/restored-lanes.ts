import type { HiddenState } from '#src/recap/domain/board.ts';
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

export function bootObservations(hidden: HiddenState, source: LiveLanes, log: (line: string) => void): readonly Observation[] {
    const restored = restoredObservation(source, log);
    return [{ kind: 'hidden-restored', state: hidden }, ...(restored === null ? [] : [restored])];
}
