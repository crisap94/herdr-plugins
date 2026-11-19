import type { GuardedLedger, GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import { setTimeout as sleep } from 'node:timers/promises';
import type { AutocompactBriefs } from '#src/ports/autocompact-briefs.ts';
import type { AskLedger } from '#src/ports/ask-ledger.ts';
import type { Fleet } from '#src/ports/fleet.ts';
import { covered } from '#src/recap/application/brief-coverage.ts';
import type { Coverage, CoverageFact } from '#src/recap/application/brief-coverage.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import { BriefDesk } from '#src/recap/application/compaction-brief.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import type { AutocompactRecords } from '#src/ports/autocompact-records.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { CompactionBriefs } from '#src/ports/compaction-briefs.ts';
import { Compaction } from '#src/recap/application/compaction.ts';
import { compactionPlans } from '#src/adapters/capability/compaction-plans.ts';
import type { LaneClaims } from '#src/recap/application/lane-claims.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { lanesOf } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { AnswerStage, RequestId } from '#src/protocol/primitives.ts';
import type { CompactionRecords } from '#src/ports/compaction-records.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import type { Boundaries } from '#src/ports/boundaries.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { ceilingOverrideNow, listsPaneIn, refreshVia } from './legacy.ts';
import { loadConfig, messagesOf } from './config.ts';

interface CoverageCheck {
    check(brief: Text, facts: readonly CoverageFact[]): Promise<Coverage>;
}

interface CompactionWebs {
    of(pane: PaneId): LaneWeb | null;
}

interface CompactionAnswers {
    answer(id: RequestId, pane: PaneId, stage: AnswerStage): void;
}

interface CompactionTyping {
    acquire(pane: PaneId): Promise<'taken' | 'busy' | 'unavailable'>;
    release(pane: PaneId): Promise<void>;
}

interface CompactionParts {
    readonly fleet: Fleet;
    readonly records: GuardedRecapRecords;
    readonly compactions: CompactionRecords;
    readonly settling: LaneSettling;
    readonly ledger: GuardedLedger;
    readonly boundaries: Boundaries;
    readonly webs: CompactionWebs;
    readonly recaps: Pick<TabRecaps, 'refresh'>;
    readonly informer: Informer;
    readonly briefs: () => CompactionBriefs | null;
    readonly recent: LaneRecent;
    readonly coverageDecider: () => Decider | null;
    readonly decisions: AutocompactRecords;
    readonly checkedBriefs: AutocompactBriefs;
    readonly answers: CompactionAnswers;
    readonly asks: AskLedger;
    readonly typing: CompactionTyping;
    readonly events: LaneEvents;
    readonly claims: LaneClaims;
    log(line: Text): void;
}

export function coverageOf(decider: Decider | null, tuning: () => AutocompactTuning): CoverageCheck | null {
    return decider === null ? null : { check: (text, facts) => covered(text, facts, decider, tuning().coverageAtLeast) };
}

export function wireCompaction(parts: CompactionParts): Compaction {
    const { fleet, informer, recaps } = parts;
    const brief = new BriefDesk({ writer: (): CompactionBriefs | null => parts.briefs(), log: (line: Text): void => { parts.log(line); } });
    return new Compaction({
        compactionPlans,
        agents: fleet.agents(), notifier: fleet, records: parts.records, boundaries: parts.boundaries, ledger: parts.ledger, compactions: parts.compactions, settling: parts.settling, webs: parts.webs, log: (line: Text) => { parts.log(line); },
        brief, recent: (lane) => parts.recent.of(lane), marks: (lane) => parts.recent.marks(lane), pause: sleep, now: () => instant(Date.now()),
        lanes: (tab: TabId) => lanesOf(informer.current, tab),
        listsPane: listsPaneIn(informer),
        focused: async (tab: TabId): Promise<PaneId | null> => {
            const layout = await fleet.layout(tab);
            return isUnknown(layout) || layout.focused === null ? null : paneId(layout.focused);
        },
        refresh: refreshVia(recaps, parts.records),
        coverage: () => coverageOf(parts.coverageDecider(), () => loadConfig().tuning),
        decisions: parts.decisions,
        checkedBriefs: parts.checkedBriefs,
        ceilingOverride: ceilingOverrideNow,
        missedFacts: () => loadConfig().autocompact.missedFacts,
        answer: (id: RequestId, pane: PaneId, stage: AnswerStage) => { parts.answers.answer(id, pane, stage); },
        asks: parts.asks,
        typing: parts.typing,
        events: parts.events,
        claims: parts.claims,
        target: () => loadConfig().compaction.target,
        messages: messagesOf,
    });
}
