import type { TaskId } from '#src/recap/domain/fact.ts';
import type { ClosedLane, ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { AgentKind, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { LastRun } from './recap-records.ts';
import type { Unknown } from './unknowable.ts';

export interface ClosureAssociation {
    readonly task: TaskId;
    readonly name: string | null;
}

export interface ClosedLaneRecord {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly closedAt: Instant;
    readonly cwd: string | null;
    readonly association: ClosureAssociation | null;
}

export type ClosedLaneRead = { readonly kind: 'absent' } | { readonly kind: 'row'; readonly record: ClosedLaneRecord } | Unknown;

export type ClosedLaneList = { readonly kind: 'listed'; readonly records: readonly ClosedLaneRecord[] } | Unknown;

export interface ClosureRecorder {
    record(closed: ClosedLane): void;
}

export interface ClosureReader {
    resolve(identity: ClosedLaneIdentity): ClosedLaneRead;
    listOf(tab: TabId, now: Instant): ClosedLaneList;
}

export interface ClosureRuns {
    runAt(task: TaskId, at: Instant): LastRun | null;
}

export interface ClosureSweep {
    protectedTabs(now: Instant): readonly TabId[];
    expiredTabs(now: Instant): readonly TabId[];
    countOf(tab: TabId): number;
    pruneTab(tab: TabId, now: Instant): number;
}
