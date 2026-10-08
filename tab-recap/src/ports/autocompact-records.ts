export type DecisionMode = 'shadow' | 'on';
export type DecisionGate = 'ask' | 'ceiling' | 'coverage';
export type DecisionVerdict = 'compact' | 'wait' | 'undecided' | 'unknown';
/** The gates that stop a lane before a decision: a skip keeps one of these. */
export type SkipGate = 'below-minimum' | 'busy' | 'in-flight' | 'cooldown' | 'unchanged' | 'no-context';

/** What stopped a lane's consideration, as it is written: replaced at each skip, removed by a decision. */
export interface Skip {
    readonly tab: string;
    readonly pane: string;
    readonly agent: string;
    readonly at: number;
    readonly gate: SkipGate;
    /** the context share in percent; null when it is not known */
    readonly share: number | null;
    readonly detail: string | null;
}

/** The lane's last decision, as the `unchanged` gate reads it: the tokens and mode it was made at. */
export interface LastDecision {
    readonly at: number;
    readonly tokens: number;
    readonly mode: DecisionMode;
    /** `unknown` does not count as unchanged: the decider is asked again */
    readonly verdict: DecisionVerdict;
}

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
    /** the lane's newest `compact` decision that led to no compaction yet points at `compactionId`; its id, or null when there is none */
    linkLatest(tab: string, pane: string, compactionId: string): string | null;
    /** the brief's check ran for the decision (`coverage` null when it could not): it is stored, and `waited` turns the verdict into `wait` with the gate `coverage` and `why` */
    amend(id: string, coverage: Readonly<Record<string, number>> | null, waited: boolean, why: string | null): void;
    /** when the lane last got a decision of any verdict (epoch ms); null when never */
    lastDecisionAt(tab: string, pane: string): number | null;
    /** the lane's newest decision of any verdict (its time, tokens and mode); null when there is none */
    lastDecision(tab: string, pane: string): LastDecision | null;
    /** the decision's request was made: `requested` is set, and only requested decisions count as asked for */
    markRequested(id: string): void;
    /** whether the lane has a requested `compact` decision of mode `on` at or after `at` that led to no compaction yet: asked for, not begun */
    unlinkedCompactSince(tab: string, pane: string, at: number): boolean;
    /** the same for any lane of any tab */
    unlinkedCompactAny(at: number): boolean;
    /** deletes the skips of every lane not in `keep` (all of them when `keep` is empty) */
    pruneSkips(keep: readonly { readonly tab: string; readonly pane: string }[]): void;
    /** the lane's latest skip is replaced by this one */
    skip(skip: Skip): void;
    /** every lane's latest skip, newest first */
    skips(): readonly Skip[];
    /** newest first; of one tab when given */
    newest(limit: number, tab?: string): readonly StoredDecision[];
    countsFor(tab: string): DecisionCounts;
    /** money spent by decisions at or after `at`, in USD */
    costSince(at: number): number;
}
