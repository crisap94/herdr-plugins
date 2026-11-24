import { instant } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { Clock } from '@stateforge-labs/session-ledger';

export class SystemClock implements Clock {
    now(): Instant {
        return instant(Date.now());
    }
}
