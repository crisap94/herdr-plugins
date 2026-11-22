import type { ClosedWhy, Fact, Section, TaskId } from '#src/recap/domain/fact.ts';
import type { PaneId, TabId } from '#src/recap/domain/lane-shape.ts';
import type { Refusal } from '#src/recap/domain/ops.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Unknown } from '#src/ports/unknowable.ts';

export interface HistoryFact {
    readonly section: Section;
    readonly text: Text;
    readonly why: Text | null;
    readonly state: 'open' | 'closed';
    readonly closedWhy: ClosedWhy | null;
    readonly closedAt: Instant | null;
    readonly firstAt: Instant;
    readonly lastAt: Instant;
}

export interface Ledger {
    openOf(task: TaskId): readonly Fact[];
    recentlyClosed(task: TaskId, sinceMs: Instant): readonly Fact[];
    allOf(task: TaskId): readonly Fact[];
    keysOf(tab: TabId): readonly Text[];
    historyOf(tab: TabId, pane: PaneId): readonly HistoryFact[];
}

export interface Applied {
    readonly changed: readonly Fact[];
    readonly refused: readonly Refusal[];
}

type Reads = 'openOf' | 'recentlyClosed' | 'keysOf' | 'allOf';

export type CheckedLedger = Omit<Ledger, Reads> & {
    readonly [K in Reads]: (...args: Parameters<Ledger[K]>) => ReturnType<Ledger[K]> | Unknown;
};
