import type { Count } from '#src/recap/domain/count.ts';
import type { Duration } from '#src/recap/domain/time.ts';

export interface UsageSample {
    readonly cpu: Duration;
    readonly rss: Count;
}

export interface ProcessUsage {
    sample(): UsageSample;
}
