import type { Messages } from '#src/i18n/index.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Agents } from '#src/ports/agents.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import type { Notifier } from '#src/ports/notifier.ts';
import type { Boundaries } from '#src/ports/boundaries.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import type { Entry, Mark } from '#src/ports/transcripts.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import type { AutocompactRecords } from '#src/ports/autocompact-records.ts';
import type { Written } from './compaction-brief.ts';
import type { Coverage, CoverageFact } from './brief-coverage.ts';
import type { Records } from './compaction-trail.ts';

export interface CompactionDeps {
    readonly agents: Agents;
    readonly notifier: Notifier;
    readonly records: Pick<RecapRecords, 'readRecap'>;
    readonly ledger: Pick<Ledger, 'historyOf'>;
    /** where the agent's session last broke: the facts closed before it are named as settled in the brief */
    readonly boundaries: Pick<Boundaries, 'lastBreakAt'>;
    /** the compaction records: every stage of every compaction is written here, the column and the bar read it */
    readonly compactions: Records;
    /** herdr's push that a lane is free again (polling when the daemon is blind) */
    readonly settling: LaneSettling;
    /** writes the brief from a document; no text when it is off or gave none (the template is used, and `why` says why) */
    readonly brief: { enabled(): boolean; job(): string | null; write(document: string, own: string, correction?: string): Promise<Written> };
    /** an automatic compaction checks its brief against the facts before anything is typed; null when there is no decider (it goes ahead unchecked) */
    coverage(): { check(brief: string, facts: readonly CoverageFact[]): Promise<Coverage> } | null;
    /** the decisions an automatic compaction points back to */
    readonly decisions: Pick<AutocompactRecords, 'linkLatest' | 'amend'> | null;
    /** the agent's last turns, read from its own records; empty when they cannot be read */
    recent(lane: Lane): Promise<readonly Entry[]>;
    /** the compactions the agent's own records show, newest last; empty when they cannot be read */
    marks(lane: Lane): Promise<readonly Mark[]>;
    pause(ms: number): Promise<void>;
    now(): number;
    readonly webs: { of(pane: string): LaneWeb | null };
    /** the lanes the daemon holds for the tab */
    lanes(tab: string): readonly Lane[];
    /** the pane herdr focuses in the tab */
    focused(tab: string): Promise<string | null>;
    /** the tab's recap, written now and awaited; it never rejects (a failed or slow one leaves the last good recap) */
    refresh(tab: string, lanes: readonly Lane[]): Promise<void>;
    target(): CompactTarget;
    messages(): Messages;
    log(line: string): void;
}
