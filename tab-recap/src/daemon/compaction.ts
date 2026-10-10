import type { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { covered } from '#src/recap/application/brief-coverage.ts';
import type { Coverage, CoverageFact } from '#src/recap/application/brief-coverage.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import { BriefDesk } from '#src/recap/application/compaction-brief.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import type { AutocompactRecords } from '#src/ports/autocompact-records.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { CompactionBriefs } from '#src/ports/compaction-briefs.ts';
import { Compaction } from '#src/recap/application/compaction.ts';
import type { CompactionClaims } from '#src/recap/application/compaction-claims.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { lanesOf } from '#src/recap/domain/board.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { CompactionRecords } from '#src/ports/compaction-records.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { Boundaries } from '#src/ports/boundaries.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { bounded } from './bounded.ts';
import { loadConfig, messagesOf } from './config.ts';

const RECAP_WAIT_MS = 90_000;

export function coverageOf(decider: Decider | null, tuning: () => AutocompactTuning): { check(brief: string, facts: readonly CoverageFact[]): Promise<Coverage> } | null {
    return decider === null ? null : { check: (text, facts) => covered(text, facts, decider, tuning().coverageAtLeast) };
}

export function wireCompaction(parts: {
    readonly fleet: HerdrFleet;
    readonly records: RecapRecords;
    readonly compactions: CompactionRecords;
    readonly settling: LaneSettling;
    readonly ledger: Ledger;
    readonly boundaries: Boundaries;
    readonly webs: { of(pane: string): LaneWeb | null };
    readonly recaps: RecapJob;
    readonly informer: Informer;
    readonly briefs: () => CompactionBriefs | null;
    readonly recent: LaneRecent;
    readonly coverageDecider: () => Decider | null;
    readonly decisions: AutocompactRecords;
    readonly answers: { answer(id: string, pane: string, stage: string): void };
    readonly typing: { acquire(pane: string): Promise<'taken' | 'busy' | 'unavailable'>; release(pane: string): Promise<void> };
    readonly events: LaneEvents;
    readonly claims: CompactionClaims;
    log(line: string): void;
}): Compaction {
    const { fleet, informer, recaps } = parts;
    const brief = new BriefDesk({ writer: (): CompactionBriefs | null => parts.briefs(), log: (line: string): void => { parts.log(line); } });
    return new Compaction({
        agents: fleet.agents(), notifier: fleet, records: parts.records, boundaries: parts.boundaries, ledger: parts.ledger, compactions: parts.compactions, settling: parts.settling, webs: parts.webs, log: (line) => { parts.log(line); },
        brief, recent: (lane) => parts.recent.of(lane), marks: (lane) => parts.recent.marks(lane), pause: (ms) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }), now: () => Date.now(),
        lanes: (tab) => lanesOf(informer.current, tabId(tab)),
        focused: async (tab) => {
            const layout = await fleet.layout(tabId(tab));
            return isUnknown(layout) ? null : layout.focused;
        },
        refresh: async (tab, lanes) => {
            await bounded(recaps.refreshNow(tabId(tab), lanes), RECAP_WAIT_MS);
        },
        coverage: () => coverageOf(parts.coverageDecider(), () => loadConfig().tuning),
        decisions: parts.decisions,
        answer: (id, pane, stage) => { parts.answers.answer(id, pane, stage); },
        typing: parts.typing,
        events: parts.events,
        claims: parts.claims,
        target: () => loadConfig().compaction.target,
        messages: messagesOf,
    });
}
