import type { Messages } from '#src/i18n/index.ts';
import type { GuardedLedger, GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { AgentPanes } from '#src/ports/agents.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import type { NotifierPort } from '#src/ports/notifier.ts';
import type { Boundaries } from '#src/ports/boundaries.ts';
import type { Entry, Mark } from '#src/ports/transcripts.ts';
import type { AutocompactRecords } from '#src/ports/autocompact-records.ts';
import type { MissedFacts } from '#src/recap/domain/autocompact.ts';
import type { Records } from '../../compaction-trail.ts';
import type { LaneEvents } from '../../lane-events.ts';
import type { LaneClaims } from '../../lane-claims.ts';
import type { RecapRefresh } from '../../recap-wait.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Duration } from '#src/recap/domain/time.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { CompactionPlans } from '#src/ports/compaction-plans.ts';
import type { AutocompactBriefs } from '#src/ports/autocompact-briefs.ts';
import type { AskLedger } from '#src/ports/ask-ledger.ts';
import type { CompactionPorts, BriefPort, CoveragePort, LaneWebs, RestoreHandoff, TypingPort } from '../../compaction-deps.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';

interface OldBriefPort extends Omit<BriefPort, 'job'> { job(): string | null }

export interface CompactionDeps {
    readonly compactionPlans: CompactionPlans;
    readonly agents: AgentPanes;
    readonly notifier: NotifierPort;
    readonly records: Pick<GuardedRecapRecords, 'readRecap'>;
    readonly ledger: Pick<GuardedLedger, 'historyOf'>;
    readonly boundaries: Pick<Boundaries, 'lastBreakAt'>;
    readonly compactions: Records;
    readonly settling: LaneSettling;
    readonly brief: OldBriefPort;
    coverage(): CoveragePort | null;
    readonly decisions: Pick<AutocompactRecords, 'linkLatest' | 'amend' | 'lastDecision'> | null;
    readonly checkedBriefs?: AutocompactBriefs;
    ceilingOverride?(this: void): boolean;
    missedFacts?(): MissedFacts;
    answer?(id: string, pane: string, stage: string): void;
    readonly asks?: Pick<AskLedger, 'attach'>;
    readonly typing?: TypingPort;
    readonly events?: LaneEvents;
    readonly claims: LaneClaims;
    readonly restores?: RestoreHandoff;
    recent(lane: Lane): Promise<readonly Entry[]>;
    marks(lane: Lane): Promise<readonly Mark[]>;
    pause(ms: Duration): Promise<void>;
    now(this: void): number;
    readonly webs: LaneWebs;
    lanes(tab: string): readonly Lane[];
    listsPane(this: void, pane: string): boolean;
    focused(this: void, tab: string): Promise<string | null>;
    refresh: RecapRefresh;
    target(): CompactTarget;
    messages(): Messages;
    log(line: string): void;
}

const presence = (on: boolean): Presence => (on ? 'present' : 'absent');

export function wiringOf(deps: CompactionDeps): CompactionPorts {
    const { brief, ceilingOverride, now, listsPane, focused, ...rest } = deps;
    return {
        ...rest,
        brief: {
            enabled: (): Presence => brief.enabled(),
            job: (): Text | null => {
                const writer = brief.job();
                return writer === null ? null : must(parseText(writer));
            },
            write: (document, own, correction) => brief.write(document, own, correction),
        },
        ...(ceilingOverride === undefined ? {} : { ceilingOverride: (): Presence => presence(ceilingOverride()) }),
        now: (): Instant => instant(now()),
        listsPane: (pane: PaneId): Presence => presence(listsPane(pane)),
        focused: async (tab: TabId): Promise<PaneId | null> => {
            const found = await focused(tab);
            return found === null ? null : paneId(found);
        },
    };
}
