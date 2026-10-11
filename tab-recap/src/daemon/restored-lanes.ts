import { must } from '#src/protocol/result.ts';
import type { HiddenState } from '#src/recap/domain/board.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { LiveLanes } from '#src/ports/tab-views.ts';

type RestoredObservation = Observation | null;

export function restoredObservation(source: LiveLanes, log: (line: Text) => void): RestoredObservation {
    const read = source.liveLanes();
    if (read.kind === 'unknown') {
        log(must(parseText(`restored lanes: the persisted lanes could not be read (${read.why.why})`)));
        return null;
    }
    return { kind: 'restored', lanes: read.lanes };
}

export function bootObservations(hidden: HiddenState, source: LiveLanes, log: (line: Text) => void): readonly Observation[] {
    const restored = restoredObservation(source, log);
    return [{ kind: 'hidden-restored', state: hidden }, ...(restored === null ? [] : [restored])];
}
