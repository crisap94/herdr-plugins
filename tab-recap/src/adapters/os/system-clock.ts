import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Clock } from '#src/ports/clock.ts';

export class SystemClock implements Clock {
    now(): Instant {
        return instant(Date.now());
    }
}
