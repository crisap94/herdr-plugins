import type { Instant } from '#src/recap/domain/time.ts';

export interface Clock {
    now(): Instant;
}
