import type { GuardedLedger, GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { Messages } from '#src/i18n/index.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { AgentPanes } from '#src/ports/agents.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import type { NotifierPort } from '#src/ports/notifier.ts';
import type { BoundaryLog } from '#src/ports/boundaries.ts';
import type { Entry, Mark } from '#src/ports/transcripts.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import type { DecisionLedger } from '#src/ports/autocompact-records.ts';
import type { MissedFacts } from '#src/recap/domain/autocompact.ts';
import type { Written } from './compaction-brief.ts';
import type { CheckedCoverage } from './brief-coverage.ts';
import type { CheckedFact } from '#src/recap/domain/autocompact.ts';
import type { Records } from './compaction-trail.ts';
import type { LaneEvents } from './lane-events.ts';
import type { LaneClaims } from './lane-claims.ts';
import type { RecapRefresh } from './recap-wait.ts';
import type { PaneId, SessionId, TabId } from '#src/recap/domain/ids.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { CompactionPlanner } from '#src/ports/compaction-plans.ts';
import type { DecisionBriefs } from '#src/ports/autocompact-briefs.ts';
import type { AskBook } from '#src/ports/ask-ledger.ts';
import type { AnswerStage, RequestId } from '#src/protocol/primitives.ts';

export interface BriefPort { enabled(): Presence; job(): Text | null; write(document: Text, own: Text, correction?: Text): Promise<Written> }

export interface CoveragePort { check(brief: Text, facts: readonly CheckedFact[]): Promise<CheckedCoverage> }

export interface TypingPort { acquire(pane: PaneId): Promise<'taken' | 'busy' | 'unavailable'>; release(pane: PaneId): Promise<void> }

export interface LaneWebs { of(pane: PaneId): LaneWeb | null }

export interface RestoreHandoff { offer(session: SessionId, text: Text): void; take(session: SessionId): Text | null }

export interface CompactionPorts {
    readonly compactionPlans: CompactionPlanner;
    readonly agents: AgentPanes;
    readonly notifier: NotifierPort;
    readonly records: Pick<GuardedRecapRecords, 'readRecap'>;
    readonly ledger: Pick<GuardedLedger, 'historyOf'>;
    readonly boundaries: Pick<BoundaryLog, 'lastBreakAt'>;
    readonly compactions: Records;
    readonly settling: LaneSettling;
    readonly brief: BriefPort;
    coverage(): CoveragePort | null;
    readonly decisions: Pick<DecisionLedger, 'linkLatest' | 'amend' | 'lastDecision'> | null;
    readonly checkedBriefs?: DecisionBriefs;
    ceilingOverride?(): Presence;
    missedFacts?(): MissedFacts;
    answer?(id: RequestId, pane: PaneId, stage: AnswerStage): void;
    readonly asks?: Pick<AskBook, 'attach'>;
    readonly typing?: TypingPort;
    readonly events?: LaneEvents;
    readonly claims: LaneClaims;
    readonly restores?: RestoreHandoff;
    recent(lane: Lane): Promise<readonly Entry[]>;
    marks(lane: Lane): Promise<readonly Mark[]>;
    pause(ms: Duration): Promise<void>;
    now(): Instant;
    readonly webs: LaneWebs;
    lanes(tab: TabId): readonly Lane[];
    listsPane(pane: PaneId): Presence;
    focused(tab: TabId): Promise<PaneId | null>;
    refresh: RecapRefresh;
    target(): CompactTarget;
    messages(): Messages;
    log(line: Text): void;
}
