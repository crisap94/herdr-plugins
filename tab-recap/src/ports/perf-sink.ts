import type { PerfCounter } from '#src/recap/domain/perf.ts';

export interface PerfSink {
    bump(counter: PerfCounter): void;
}
