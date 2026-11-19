import type { PaneId } from '#src/recap/domain/ids.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { Instant, Milliseconds } from '#src/recap/domain/time.ts';

export type { LaneSettling, Settled } from './twins/runs/legacy.ts';

export interface SettledStatus {
    readonly kind: 'settled';
    readonly status: LaneStatus;
}

export interface SettleTimeout {
    readonly kind: 'timeout';
}

export type Settling = SettledStatus | SettleTimeout;

export interface LaneSettler {
    settled(pane: PaneId, since: Instant, timeoutMs: Milliseconds): Promise<Settling>;
}
