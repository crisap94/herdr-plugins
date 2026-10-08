export type DecisionMode = 'shadow' | 'on';
export type DecisionGate = 'ask' | 'ceiling' | 'coverage';
export type DecisionVerdict = 'compact' | 'wait' | 'undecided' | 'unknown';

/** What one consideration of a lane decided, as it is written. */
export interface Decision {
    readonly tab: string;
    readonly pane: string;
    readonly agent: string;
    readonly at: number;
    readonly mode: DecisionMode;
    readonly share: number;
    readonly tokens: number;
    readonly window: number;
    readonly gate: DecisionGate;
    readonly verdict: DecisionVerdict;
    /** question id → probability; empty when no model was asked */
    readonly answers: Readonly<Record<string, number>>;
    /** fact key → probability, when brief coverage ran */
    readonly coverage: Readonly<Record<string, number>> | null;
    readonly decider: string | null;
    readonly costUsd: number;
    readonly tookMs: number | null;
    /** why it is `unknown`, or what gate stopped it */
    readonly why: string | null;
}

/** A decision as read back. */
export interface StoredDecision extends Decision {
    /** the TypeID, `dcn_…` */
    readonly id: string;
    /** the compaction it led to, once one began (`cmp_…`) */
    readonly compactionId: string | null;
}

export interface DecisionCounts {
    readonly decisions: number;
    /** decisions that led to a compaction */
    readonly compacted: number;
    /** decisions that were `wait`, `undecided` or `unknown` */
    readonly waited: number;
}

/** The autocompact decisions: the daemon writes them, the `autocompact` command and the expanded view read. */
export interface AutocompactRecords {
    record(decision: Decision): string;
    /** the decision points at the compaction it led to */
    link(id: string, compactionId: string): void;
    /** when the lane last got a verdict that was not `compact` (epoch ms); null when never */
    lastWaitAt(tab: string, pane: string): number | null;
    /** newest first; of one tab when given */
    newest(limit: number, tab?: string): readonly StoredDecision[];
    countsFor(tab: string): DecisionCounts;
    /** money spent by decisions at or after `at`, in USD */
    costSince(at: number): number;
}
