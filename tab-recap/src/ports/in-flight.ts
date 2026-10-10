import type { Lane } from '#src/recap/domain/lane.ts';

export type InFlightReading =
    | { readonly kind: 'not-started'; readonly why: string }
    | { readonly kind: 'count'; readonly count: number }
    | { readonly kind: 'unknown'; readonly why: string };

export interface InFlight {
    read(lane: Lane): Promise<InFlightReading>;
}
