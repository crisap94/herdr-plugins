import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import type { Operation, Refusal, RunRef } from '#src/recap/domain/ops.ts';

/** What applying an answer did: the facts it created or changed, and what the fold refused. */
export interface Applied {
    readonly changed: readonly Fact[];
    readonly refused: readonly Refusal[];
}

/** One fact of an agent's tasks as the compaction brief reads it. */
export interface HistoryFact {
    readonly section: string;
    readonly text: string;
    readonly why: string | null;
    readonly state: 'open' | 'closed';
    readonly closedWhy: string | null;
    /** when it closed (epoch ms); null while open */
    readonly closedAt: number | null;
    readonly firstAt: number;
    readonly lastAt: number;
}

/** The facts of the tasks of a tab. Facts are never deleted: a fact is closed with a reason. */
export interface Ledger {
    /** the task's open facts, in the order the column draws them (newest last seen first) */
    openOf(task: TaskId): readonly Fact[];
    /** the facts closed since `sinceMs` (epoch ms), newest last */
    recentlyClosed(task: TaskId, sinceMs: number): readonly Fact[];
    /** fold `ops` into the task's facts and keep the result; one transaction, so a failing write leaves nothing of the answer */
    apply(run: RunRef, ops: readonly Operation[]): Applied;
    /** every fact of the task, open and closed, oldest first */
    allOf(task: TaskId): readonly Fact[];
    /** the keys of the tab's tasks that have facts, open or closed (a key that has ever had a ledger is never given to another task) */
    keysOf(tab: string): readonly string[];
    /** every fact of the tasks that hold `pane`, open and closed, newest last seen first (at most 300; finished and closed facts are cut first) */
    historyOf(tab: string, pane: string): readonly HistoryFact[];
}
