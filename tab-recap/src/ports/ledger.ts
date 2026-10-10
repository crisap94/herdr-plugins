import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import type { Operation, Refusal, RunRef } from '#src/recap/domain/ops.ts';

export interface Applied {
    readonly changed: readonly Fact[];
    readonly refused: readonly Refusal[];
}

export interface HistoryFact {
    readonly section: string;
    readonly text: string;
    readonly why: string | null;
    readonly state: 'open' | 'closed';
    readonly closedWhy: string | null;
    readonly closedAt: number | null;
    readonly firstAt: number;
    readonly lastAt: number;
}

export interface Ledger {
    openOf(task: TaskId): readonly Fact[];
    recentlyClosed(task: TaskId, sinceMs: number): readonly Fact[];
    apply(run: RunRef, ops: readonly Operation[]): Applied;
    allOf(task: TaskId): readonly Fact[];
    keysOf(tab: string): readonly string[];
    historyOf(tab: string, pane: string): readonly HistoryFact[];
}
