import type { Count } from '@stateforge-labs/session-ledger';
import type { BackgroundItem } from '@stateforge-labs/session-ledger';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Text } from '@stateforge-labs/session-ledger';

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
