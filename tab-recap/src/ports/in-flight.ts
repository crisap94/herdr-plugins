import type { Count } from '#src/recap/domain/count.ts';
import type { BackgroundItem } from '#src/recap/domain/in-flight.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Text } from '#src/recap/domain/text.ts';

export interface InFlightNotStarted {
    readonly kind: 'not-started';
    readonly why: Text;
}

export interface InFlightCount {
    readonly kind: 'count';
    readonly count: Count;
    readonly background: readonly BackgroundItem[];
}

export interface InFlightUnknown {
    readonly kind: 'unknown';
    readonly why: Text;
}

export type InFlightRead = InFlightNotStarted | InFlightCount | InFlightUnknown;

export interface InFlightReader {
    read(lane: Lane): Promise<InFlightRead>;
}
