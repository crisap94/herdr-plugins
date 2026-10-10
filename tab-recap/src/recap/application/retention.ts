import type { Clock } from '#src/ports/clock.ts';
import type { Retention } from '#src/ports/retention.ts';
import { cutoffOf } from '#src/recap/domain/retention.ts';

export interface SweepDeps {
    readonly retention: Retention;
    readonly clock: Clock;
    days(): number;
    log(line: string): void;
}

export function sweep(deps: SweepDeps): number {
    const cutoff = cutoffOf(deps.clock.now(), deps.days());
    if (cutoff === null) {
        return 0;
    }
    let gone = 0;
    for (const tab of deps.retention.expired(cutoff)) {
        try {
            const taken = deps.retention.remove(tab);
            gone += 1;
            deps.log(`retention: removed ${tab} (${taken.runs} runs, ${taken.facts} facts, ${taken.chapters} chapters, ${taken.boundaries} boundaries, ${taken.compactions} compactions)`);
        } catch (error) {
            deps.log(`retention: could not remove ${tab}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return gone;
}
