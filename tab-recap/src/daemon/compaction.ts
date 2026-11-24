import type { GuardedLedger, GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import { setTimeout as sleep } from 'node:timers/promises';
import type { DecisionBriefs } from '#src/ports/autocompact-briefs.ts';
import type { AskBook } from '#src/ports/ask-ledger.ts';
import type { Fleet } from '#src/ports/fleet.ts';
import { parseProbability } from '@stateforge-labs/session-ledger';
import { checkCoverage, probabilityRequired } from '#src/recap/application/brief-coverage.ts';
import type { CheckedCoverage } from '#src/recap/application/brief-coverage.ts';
import type { CheckedFact } from '@stateforge-labs/session-ledger';
import type { CompactTuning } from '@stateforge-labs/session-ledger';
import { BriefDesk } from '#src/recap/application/compaction-brief.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import type { DecisionLedger } from '@stateforge-labs/session-ledger';
import type { DeciderPort } from '@stateforge-labs/session-ledger';
import type { BriefWriter } from '#src/ports/compaction-briefs.ts';
import { Compaction } from '#src/recap/application/compaction.ts';
import { compactionPlanner } from '#src/adapters/capability/compaction-plans.ts';
import type { PreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import type { LaneClaims } from '#src/recap/application/lane-claims.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { lanesOf, listsPane } from '#src/recap/domain/board.ts';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import { instant } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseWireText, type AnswerStage, type RequestId, type WireText } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { CompactionLog } from '#src/ports/compaction-records.ts';
import type { LaneSettler } from '#src/ports/lane-settling.ts';
import type { BoundaryLog } from '#src/ports/boundaries.ts';
import type { LaneWebRecord } from '#src/ports/tab-views.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import { isUnknown } from '@stateforge-labs/session-ledger';
import { refreshVia } from './refresh-status.ts';
import { loadSettings, messagesOf } from './config.ts';

interface CoverageCheck {
    check(brief: Text, facts: readonly CheckedFact[]): Promise<CheckedCoverage>;
}

interface CompactionWebs {
    of(pane: SessionKey): LaneWebRecord | null;
}

interface CompactionAnswers {
    answer(id: RequestId, pane: SessionKey, stage: WireText): void;
}

interface CompactionTyping {
    acquire(pane: SessionKey): Promise<'taken' | 'busy' | 'unavailable'>;
    release(pane: SessionKey): Promise<void>;
}

interface CompactionParts {
    readonly fleet: Fleet;
    readonly records: GuardedRecapRecords;
    readonly compactions: CompactionLog;
    readonly settling: LaneSettler;
    readonly ledger: GuardedLedger;
    readonly boundaries: BoundaryLog;
    readonly webs: CompactionWebs;
    readonly recaps: Pick<TabRecaps, 'refresh'>;
    readonly informer: Informer;
    readonly briefs: () => BriefWriter | null;
    readonly recent: LaneRecent;
    readonly coverageDecider: () => DeciderPort | null;
    readonly decisions: DecisionLedger;
    readonly checkedBriefs: DecisionBriefs;
    readonly answers: CompactionAnswers;
    readonly asks: AskBook;
    readonly typing: CompactionTyping;
    readonly events: LaneEvents;
    readonly claims: LaneClaims;
    readonly preCompacts: PreCompacts;
    log(line: Text): void;
}

export function coverageOf(decider: DeciderPort | null, tuning: () => CompactTuning): CoverageCheck | null {
    return decider === null ? null : { check: (text, facts) => checkCoverage(text, facts, decider, probabilityRequired(parseProbability(tuning().coverageAtLeast))) };
}

export function wireCompaction(parts: CompactionParts): Compaction {
    const { fleet, informer, recaps } = parts;
    const brief = new BriefDesk({ writer: (): BriefWriter | null => parts.briefs(), log: (line: Text): void => { parts.log(line); } });
    return new Compaction({
        compactionPlans: compactionPlanner,
        agents: fleet.agents(), notifier: fleet, records: parts.records, boundaries: parts.boundaries, ledger: parts.ledger, compactions: parts.compactions, settling: parts.settling, webs: parts.webs, log: (line: Text) => { parts.log(line); },
        brief, recent: (lane) => parts.recent.of(lane), marks: (lane) => parts.recent.marks(lane), pause: sleep, now: () => instant(Date.now()),
        lanes: (tab: ScopeId) => lanesOf(informer.current, tab),
        listsPane: (pane: SessionKey): Presence => (listsPane(informer.current, pane) ? 'present' : 'absent'),
        focused: async (tab: ScopeId): Promise<SessionKey | null> => {
            const layout = await fleet.layout(tab);
            return isUnknown(layout) || layout.focused === null ? null : layout.focused;
        },
        refresh: refreshVia(recaps, parts.records),
        coverage: () => coverageOf(parts.coverageDecider(), () => loadSettings().tuning),
        decisions: parts.decisions,
        checkedBriefs: parts.checkedBriefs,
        ceilingOverride: (): Presence => (loadSettings().autocompact.ceilingPolicy === 'overrides-check' ? 'present' : 'absent'),
        missedFacts: () => loadSettings().autocompact.missedFacts,
        answer: (id: RequestId, pane: SessionKey, stage: AnswerStage) => { parts.answers.answer(id, pane, must(parseWireText(stage))); },
        asks: parts.asks,
        typing: parts.typing,
        events: parts.events,
        claims: parts.claims,
        restores: parts.preCompacts,
        target: () => loadSettings().compaction.target,
        messages: messagesOf,
    });
}
