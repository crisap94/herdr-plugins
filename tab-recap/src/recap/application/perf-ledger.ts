import type { Clock } from '#src/ports/clock.ts';
import type { PerfSink } from '#src/ports/perf-sink.ts';
import type { ProcessUsage } from '#src/ports/process-usage.ts';
import { bumped, NO_COUNTS, perfLine } from '#src/recap/domain/perf.ts';
import type { PerfCounter, PerfCounts } from '#src/recap/domain/perf.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { duration } from '#src/recap/domain/time.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';

export interface PerfLedgerDeps {
    readonly usage: ProcessUsage;
    readonly clock: Clock;
    readonly log: (line: Text) => void;
}

export class PerfLedger implements PerfSink {
    private readonly deps: PerfLedgerDeps;
    private counts: PerfCounts = NO_COUNTS;
    private since: Instant;
    private spent: Duration;

    constructor(deps: PerfLedgerDeps) {
        this.deps = deps;
        this.since = deps.clock.now();
        this.spent = deps.usage.sample().cpu;
    }

    bump(counter: PerfCounter): void {
        this.counts = bumped(this.counts, counter);
    }

    tick(): void {
        const now = this.deps.clock.now();
        const sample = this.deps.usage.sample();
        this.deps.log(perfLine({ elapsed: duration(now - this.since), counts: this.counts, cpu: duration(sample.cpu - this.spent), rss: sample.rss }));
        this.counts = NO_COUNTS;
        this.since = now;
        this.spent = sample.cpu;
    }
}
