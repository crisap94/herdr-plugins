import type { GuardedLedger, GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import { setTimeout as sleep } from 'node:timers/promises';
import type { DecisionBriefs } from '#src/ports/autocompact-briefs.ts';
import type { AskBook } from '#src/ports/ask-ledger.ts';
import type { Fleet } from '#src/ports/fleet.ts';
import { parseProbability } from '#src/recap/domain/probability.ts';
import { checkCoverage, probabilityRequired } from '#src/recap/application/brief-coverage.ts';
import type { CheckedCoverage } from '#src/recap/application/brief-coverage.ts';
import type { CheckedFact } from '#src/recap/domain/autocompact.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import { BriefDesk } from '#src/recap/application/compaction-brief.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import type { AutocompactRecords } from '#src/ports/autocompact-records.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { BriefWriter } from '#src/ports/compaction-briefs.ts';
import { Compaction } from '#src/recap/application/compaction.ts';
import { compactionPlanner } from '#src/adapters/capability/compaction-plans.ts';
import type { PreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import type { LaneClaims } from '#src/recap/application/lane-claims.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { lanesOf, listsPane } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseWireText, type AnswerStage, type RequestId, type WireText } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import type { CompactionLog } from '#src/ports/compaction-records.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import type { BoundaryLog } from '#src/ports/boundaries.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { refreshVia } from './refresh-status.ts';
import { loadSettings, messagesOf } from './config.ts';

interface CoverageCheck {
    check(brief: Text, facts: readonly CheckedFact[]): Promise<CheckedCoverage>;
}

interface CompactionWebs {
    of(pane: PaneId): LaneWeb | null;
}

interface CompactionAnswers {
    answer(id: RequestId, pane: PaneId, stage: WireText): void;
}

interface CompactionTyping {
    acquire(pane: PaneId): Promise<'taken' | 'busy' | 'unavailable'>;
    release(pane: PaneId): Promise<void>;
}

interface CompactionParts {
    readonly fleet: Fleet;
    readonly records: GuardedRecapRecords;
    readonly compactions: CompactionLog;
    readonly settling: LaneSettling;
    readonly ledger: GuardedLedger;
    readonly boundaries: BoundaryLog;
    readonly webs: CompactionWebs;
    readonly recaps: Pick<TabRecaps, 'refresh'>;
    readonly informer: Informer;
    readonly briefs: () => BriefWriter | null;
    readonly recent: LaneRecent;
    readonly coverageDecider: () => Decider | null;
    readonly decisions: AutocompactRecords;
    readonly checkedBriefs: DecisionBriefs;
    readonly answers: CompactionAnswers;
    readonly asks: AskBook;
    readonly typing: CompactionTyping;
    readonly events: LaneEvents;
    readonly claims: LaneClaims;
    readonly preCompacts: PreCompacts;
    log(line: Text): void;
}

export function coverageOf(decider: Decider | null, tuning: () => AutocompactTuning): CoverageCheck | null {
    return decider === null ? null : { check: (text, facts) => checkCoverage(text, facts, decider, probabilityRequired(parseProbability(tuning().coverageAtLeast))) };
}

export function wireCompaction(parts: CompactionParts): Compaction {
    const { fleet, informer, recaps } = parts;
    const brief = new BriefDesk({ writer: (): BriefWriter | null => parts.briefs(), log: (line: Text): void => { parts.log(line); } });
    return new Compaction({
        compactionPlans: compactionPlanner,
        agents: fleet.agents(), notifier: fleet, records: parts.records, boundaries: parts.boundaries, ledger: parts.ledger, compactions: parts.compactions, settling: parts.settling, webs: parts.webs, log: (line: Text) => { parts.log(line); },
        brief, recent: (lane) => parts.recent.of(lane), marks: (lane) => parts.recent.marks(lane), pause: sleep, now: () => instant(Date.now()),
        lanes: (tab: TabId) => lanesOf(informer.current, tab),
        listsPane: (pane: PaneId): Presence => (listsPane(informer.current, pane) ? 'present' : 'absent'),
        focused: async (tab: TabId): Promise<PaneId | null> => {
            const layout = await fleet.layout(tab);
            return isUnknown(layout) || layout.focused === null ? null : paneId(layout.focused);
        },
        refresh: refreshVia(recaps, parts.records),
        coverage: () => coverageOf(parts.coverageDecider(), () => loadSettings().tuning),
        decisions: parts.decisions,
        checkedBriefs: parts.checkedBriefs,
        ceilingOverride: (): Presence => (loadSettings().autocompact.ceilingPolicy === 'overrides-check' ? 'present' : 'absent'),
        missedFacts: () => loadSettings().autocompact.missedFacts,
        answer: (id: RequestId, pane: PaneId, stage: AnswerStage) => { parts.answers.answer(id, pane, must(parseWireText(stage))); },
        asks: parts.asks,
        typing: parts.typing,
        events: parts.events,
        claims: parts.claims,
        restores: parts.preCompacts,
        target: () => loadSettings().compaction.target,
        messages: messagesOf,
    });
}
