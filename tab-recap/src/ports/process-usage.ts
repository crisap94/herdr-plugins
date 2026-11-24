import type { Count } from '@stateforge-labs/session-ledger';
import type { Duration } from '@stateforge-labs/session-ledger';

export interface UsageSample {
    readonly cpu: Duration;
    readonly rss: Count;
}

export interface ProcessUsage {
    sample(): UsageSample;
}
