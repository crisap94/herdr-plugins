import type { GuardedLedger, GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { Messages } from '#src/i18n/index.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { AgentPanes } from '#src/ports/agents.ts';
import type { LaneSettler } from '#src/ports/lane-settling.ts';
import type { NotifierPort } from '#src/ports/notifier.ts';
import type { BoundaryLog } from '#src/ports/boundaries.ts';
import type { Entry, Mark } from '#src/ports/transcripts.ts';
import type { LaneWebRecord } from '#src/ports/tab-views.ts';
import type { DecisionLedger } from '#src/ports/autocompact-records.ts';
import type { MissedFacts } from '#src/recap/domain/autocompact.ts';
import type { Written } from './compaction-brief.ts';
import type { CheckedCoverage } from './brief-coverage.ts';
import type { CheckedFact } from '#src/recap/domain/autocompact.ts';
import type { Records } from './compaction-trail.ts';
import type { LaneEvents } from './lane-events.ts';
import type { LaneClaims } from './lane-claims.ts';
import type { RecapRefresh } from './recap-wait.ts';
import type { SessionKey, SessionId, ScopeId } from '#src/recap/domain/ids.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { CompactionPlanner } from '#src/ports/compaction-plans.ts';
import type { DecisionBriefs } from '#src/ports/autocompact-briefs.ts';
import type { AskBook } from '#src/ports/ask-ledger.ts';
import type { AnswerStage, RequestId } from '#src/protocol/primitives.ts';

export interface BriefPort { enabled(): Presence; job(): Text | null; write(document: Text, own: Text, correction?: Text): Promise<Written> }

export interface CoveragePort { check(brief: Text, facts: readonly CheckedFact[]): Promise<CheckedCoverage> }

export interface TypingPort { acquire(pane: SessionKey): Promise<'taken' | 'busy' | 'unavailable'>; release(pane: SessionKey): Promise<void> }

export interface LaneWebs { of(pane: SessionKey): LaneWebRecord | null }

export interface RestoreHandoff { offer(session: SessionId, text: Text): void; take(session: SessionId): Text | null }

export interface CompactionPorts {
    readonly compactionPlans: CompactionPlanner;
    readonly agents: AgentPanes;
    readonly notifier: NotifierPort;
    readonly records: Pick<GuardedRecapRecords, 'readRecap'>;
    readonly ledger: Pick<GuardedLedger, 'historyOf'>;
    readonly boundaries: Pick<BoundaryLog, 'lastBreakAt'>;
    readonly compactions: Records;
    readonly settling: LaneSettler;
    readonly brief: BriefPort;
    coverage(): CoveragePort | null;
    readonly decisions: Pick<DecisionLedger, 'linkLatest' | 'amend' | 'lastDecision'> | null;
    readonly checkedBriefs?: DecisionBriefs;
    ceilingOverride?(): Presence;
    missedFacts?(): MissedFacts;
    answer?(id: RequestId, pane: SessionKey, stage: AnswerStage): void;
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
    lanes(tab: ScopeId): readonly Lane[];
    listsPane(pane: SessionKey): Presence;
    focused(tab: ScopeId): Promise<SessionKey | null>;
    refresh: RecapRefresh;
    target(): CompactTarget;
    messages(): Messages;
    log(line: Text): void;
}
