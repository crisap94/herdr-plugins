import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { Instant, Milliseconds } from '@stateforge-labs/session-ledger';

export interface SettledStatus {
    readonly kind: 'settled';
    readonly status: LaneStatus;
}

export interface SettleTimeout {
    readonly kind: 'timeout';
}

export type Settling = SettledStatus | SettleTimeout;

export interface LaneSettler {
    settled(pane: SessionKey, since: Instant, timeoutMs: Milliseconds): Promise<Settling>;
}
