import type { Clock } from '#src/ports/clock.ts';
import type { ClosureSweep } from '#src/ports/closed-lanes.ts';
import type { Retention } from '#src/ports/retention.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { cutoffOf } from '#src/recap/domain/retention.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export interface SweepDeps {
    readonly retention: Retention;
    readonly closures: ClosureSweep;
    readonly clock: Clock;
    days(): ClosedLaneDays;
    log(line: string): void;
}

export function removeExpiredTabs(deps: SweepDeps, now: Instant): Count {
    const cutoff = cutoffOf(now, deps.days());
    if (cutoff === null) {
        return must(parseCount(0));
    }
    let gone = 0;
    for (const tab of deps.retention.expired(cutoff, deps.closures.protectedTabs(now))) {
        try {
            const closures = deps.closures.countOf(tab);
            const taken = deps.retention.remove(tab);
            gone += 1;
            deps.log(`retention: removed ${tab} (${taken.runs} runs, ${taken.facts} facts, ${taken.chapters} chapters, ${taken.boundaries} boundaries, ${taken.compactions} compactions, ${closures} closures)`);
        } catch (error) {
            deps.log(`retention: could not remove ${tab}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return must(parseCount(gone));
}

export function pruneClosures(deps: SweepDeps, now: Instant): Count {
    let pruned = 0;
    for (const tab of deps.closures.expiredTabs(now)) {
        try {
            const count = deps.closures.pruneTab(tab, now);
            pruned += count;
            if (count > 0) {
                deps.log(`retention: pruned ${count} closed lanes of ${tab}`);
            }
        } catch (error) {
            deps.log(`retention: could not prune closed lanes of ${tab}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return must(parseCount(pruned));
}

export function forgetClosedTabs(deps: SweepDeps): void {
    const now = deps.clock.now();
    removeExpiredTabs(deps, now);
    pruneClosures(deps, now);
}
