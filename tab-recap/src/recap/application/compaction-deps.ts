import type { GuardedLedger, GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { Messages } from '#src/i18n/index.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Agents } from '#src/ports/agents.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import type { Notifier } from '#src/ports/notifier.ts';
import type { Boundaries } from '#src/ports/boundaries.ts';
import type { Entry, Mark } from '#src/ports/transcripts.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import type { AutocompactRecords } from '#src/ports/autocompact-records.ts';
import type { MissedFacts } from '#src/recap/domain/autocompact.ts';
import type { Written } from './compaction-brief.ts';
import type { Coverage, CoverageFact } from './brief-coverage.ts';
import type { Records } from './compaction-trail.ts';
import type { LaneEvents } from './lane-events.ts';
import type { LaneClaims } from './lane-claims.ts';
import type { RecapRefresh } from './recap-wait.ts';
import type { PaneId, SessionId } from '#src/recap/domain/ids.ts';
import type { Duration } from '#src/recap/domain/time.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { CompactionPlans } from '#src/ports/compaction-plans.ts';
import type { AutocompactBriefs } from '#src/ports/autocompact-briefs.ts';
import type { AskLedger } from '#src/ports/ask-ledger.ts';

interface BriefPort { enabled(): Presence; job(): string | null; write(document: Text, own: Text, correction?: Text): Promise<Written> }

interface CoveragePort { check(brief: string, facts: readonly CoverageFact[]): Promise<Coverage> }

interface TypingPort { acquire(pane: PaneId): Promise<'taken' | 'busy' | 'unavailable'>; release(pane: PaneId): Promise<void> }

interface LaneWebs { of(pane: PaneId): LaneWeb | null }

export interface CompactionDeps {
    readonly compactionPlans: CompactionPlans;
    readonly agents: Agents;
    readonly notifier: Notifier;
    readonly records: Pick<GuardedRecapRecords, 'readRecap'>;
    readonly ledger: Pick<GuardedLedger, 'historyOf'>;
    readonly boundaries: Pick<Boundaries, 'lastBreakAt'>;
    readonly compactions: Records;
    readonly settling: LaneSettling;
    readonly brief: BriefPort;
    coverage(): CoveragePort | null;
    readonly decisions: Pick<AutocompactRecords, 'linkLatest' | 'amend' | 'lastDecision'> | null;
    readonly checkedBriefs?: AutocompactBriefs;
    ceilingOverride?(): boolean;
    missedFacts?(): MissedFacts;
    answer?(id: string, pane: string, stage: string): void;
    readonly asks?: Pick<AskLedger, 'attach'>;
    readonly typing?: TypingPort;
    readonly events?: LaneEvents;
    readonly claims: LaneClaims;
    hookRestoredAt?(session: SessionId): Instant | null;
    recent(lane: Lane): Promise<readonly Entry[]>;
    marks(lane: Lane): Promise<readonly Mark[]>;
    pause(ms: Duration): Promise<void>;
    now(): number;
    readonly webs: LaneWebs;
    lanes(tab: string): readonly Lane[];
    listsPane(pane: string): boolean;
    focused(tab: string): Promise<string | null>;
    refresh: RecapRefresh;
    target(): CompactTarget;
    messages(): Messages;
    log(line: string): void;
}
