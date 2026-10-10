export type DecisionMode = 'shadow' | 'on';
export type DecisionGate = 'ask' | 'ceiling' | 'coverage';
export type DecisionVerdict = 'compact' | 'wait' | 'undecided' | 'unknown';
export type SkipGate = 'below-minimum' | 'busy' | 'in-flight' | 'cooldown' | 'unchanged' | 'no-context';

export interface Skip {
    readonly tab: string;
    readonly pane: string;
    readonly agent: string;
    readonly at: number;
    readonly gate: SkipGate;
    readonly share: number | null;
    readonly detail: string | null;
}

export interface LastDecision {
    readonly at: number;
    readonly tokens: number;
    readonly mode: DecisionMode;
    readonly verdict: DecisionVerdict;
}

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
    readonly answers: Readonly<Record<string, number>>;
    readonly coverage: Readonly<Record<string, number>> | null;
    readonly decider: string | null;
    readonly costUsd: number;
    readonly tookMs: number | null;
    readonly why: string | null;
}

export interface StoredDecision extends Decision {
    readonly id: string;
    readonly compactionId: string | null;
}

export interface DecisionCounts {
    readonly decisions: number;
    readonly compacted: number;
    readonly waited: number;
}

export interface AutocompactRecords {
    record(decision: Decision): string;
    link(id: string, compactionId: string): void;
    linkLatest(tab: string, pane: string, compactionId: string): string | null;
    amend(id: string, coverage: Readonly<Record<string, number>> | null, waited: boolean, why: string | null): void;
    lastDecisionAt(tab: string, pane: string): number | null;
    lastDecision(tab: string, pane: string): LastDecision | null;
    markRequested(id: string): void;
    unlinkedCompactSince(tab: string, pane: string, at: number): boolean;
    unlinkedCompactAny(at: number): boolean;
    pruneSkips(keep: readonly { readonly tab: string; readonly pane: string }[]): void;
    skip(skip: Skip): void;
    skips(): readonly Skip[];
    newest(limit: number, tab?: string): readonly StoredDecision[];
    countsFor(tab: string): DecisionCounts;
    costSince(at: number): number;
}
