import type { CoverageOutcome, SkipGate, UncheckedReason } from '#src/recap/domain/autocompact.ts';

export type DecisionMode = 'shadow' | 'on';
export type DecisionGate = 'ask' | 'ceiling' | 'coverage';
export type DecisionVerdict = 'compact' | 'wait' | 'undecided' | 'unknown';
export type { SkipGate };
export type StoredCoverageOutcome = { readonly kind: 'passed' } | { readonly kind: 'missed'; readonly count: number } | { readonly kind: 'unchecked'; readonly reason: UncheckedReason };
export interface LinkedDecision {
    readonly id: string;
    readonly gate: DecisionGate;
}

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
    readonly gate: DecisionGate;
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
    readonly askedVerdict: DecisionVerdict | null;
    readonly answers: Readonly<Record<string, number>>;
    readonly coverage: Readonly<Record<string, number>> | null;
    readonly decider: string | null;
    readonly costUsd: number;
    readonly tookMs: number | null;
    readonly why: string | null;
    readonly coverageOutcome: CoverageOutcome | null;
    readonly coverageMs: number | null;
    readonly coverageCostUsd: number | null;
}

export interface StoredDecision extends Omit<Decision, 'coverageOutcome' | 'coverageMs' | 'coverageCostUsd'> {
    readonly id: string;
    readonly compactionId: string | null;
    readonly coverageOutcome: StoredCoverageOutcome | null;
    readonly coverageMs: number | null;
    readonly coverageCostUsd: number | null;
}

export interface DecisionCounts {
    readonly decisions: number;
    readonly compacted: number;
    readonly waited: number;
}

export interface CoverageAmendment {
    readonly coverage: Readonly<Record<string, number>> | null;
    readonly outcome: CoverageOutcome;
    readonly coverageMs: number;
    readonly coverageCostUsd: number | null;
    readonly why: string | null;
    readonly block: boolean;
}

export interface AutocompactRecords {
    record(decision: Decision): string;
    link(id: string, compactionId: string): void;
    linkLatest(tab: string, pane: string, compactionId: string): LinkedDecision | null;
    amend(id: string, update: CoverageAmendment): void;
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
