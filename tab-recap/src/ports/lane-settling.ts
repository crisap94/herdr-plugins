import type { Instant } from '#src/recap/domain/time.ts';

export type Settled = { readonly kind: 'settled'; readonly status: string } | { readonly kind: 'timeout' };

export interface LaneSettling {
    settled(pane: string, since: Instant, timeoutMs: number): Promise<Settled>;
}
