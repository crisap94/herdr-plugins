import type { TaskId } from '@stateforge-labs/session-ledger';
import type { ClosedLane, ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { Count } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import type { HarnessKind, SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import type { TaskName } from '#src/recap/domain/task-name.ts';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { LastRun } from '@stateforge-labs/session-ledger';
import type { Unknown } from '@stateforge-labs/session-ledger';

export interface ClosureAssociation {
    readonly task: TaskId;
    readonly name: TaskName | null;
}

export interface ClosedLaneRecord {
    readonly tab: ScopeId;
    readonly pane: SessionKey;
    readonly agent: HarnessKind;
    readonly closedAt: Instant;
    readonly cwd: Directory | null;
    readonly association: ClosureAssociation | null;
}

export type ClosedLaneRead = { readonly kind: 'absent' } | { readonly kind: 'row'; readonly record: ClosedLaneRecord } | Unknown;

export type ClosedLaneList = { readonly kind: 'listed'; readonly records: readonly ClosedLaneRecord[] } | Unknown;

export interface ClosureRecorder {
    record(closed: ClosedLane): void;
}

export interface ClosureReader {
    resolve(identity: ClosedLaneIdentity): ClosedLaneRead;
    listOf(tab: ScopeId, now: Instant): ClosedLaneList;
}

export interface ClosureRuns {
    runAt(task: TaskId, at: Instant): LastRun | null;
}

export interface ClosureSweep {
    protectedTabs(now: Instant): readonly ScopeId[];
    expiredTabs(now: Instant): readonly ScopeId[];
    countOf(tab: ScopeId): Count;
    pruneTab(tab: ScopeId, now: Instant): Count;
}
