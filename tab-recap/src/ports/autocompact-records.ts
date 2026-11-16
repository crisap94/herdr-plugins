import type { CoverageOutcome, LaneStatusAtDecision, SkipGate, UncheckedReason } from '#src/recap/domain/autocompact.ts';
import type { AgentKind, CompactionId, DecisionId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';

export type DecisionMode = 'shadow' | 'on';
export type DecisionGate = 'ask' | 'ceiling' | 'coverage';
export type DecisionVerdict = 'compact' | 'wait' | 'undecided' | 'unknown';
export type { SkipGate };
export interface PassedCoverage {
    readonly kind: 'passed';
}
export interface MissedCoverage {
    readonly kind: 'missed';
    readonly count: number;
}
export interface UncheckedCoverage {
    readonly kind: 'unchecked';
    readonly reason: UncheckedReason;
}
export type StoredCoverageOutcome = PassedCoverage | MissedCoverage | UncheckedCoverage;
export interface PaneKey {
    readonly tab: TabId;
    readonly pane: PaneId;
}
export interface LinkedDecision {
    readonly id: DecisionId;
    readonly gate: DecisionGate;
}

export interface Skip {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly at: Instant;
    readonly gate: SkipGate;
    readonly share: number | null;
    readonly detail: string | null;
}

export interface LastDecision {
    readonly at: Instant;
    readonly tokens: number;
    readonly mode: DecisionMode;
    readonly verdict: DecisionVerdict;
    readonly gate: DecisionGate;
}

export interface Decision {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly at: Instant;
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
    readonly costUsd: Usd;
    readonly tookMs: Duration | null;
    readonly why: string | null;
    readonly laneStatus: LaneStatusAtDecision | null;
    readonly coverageOutcome: CoverageOutcome | null;
    readonly coverageMs: Duration | null;
    readonly coverageCostUsd: Usd | null;
}

export interface StoredDecision extends Omit<Decision, 'coverageOutcome' | 'coverageMs' | 'coverageCostUsd'> {
    readonly id: DecisionId;
    readonly compactionId: CompactionId | null;
    readonly coverageOutcome: StoredCoverageOutcome | null;
    readonly coverageMs: Duration | null;
    readonly coverageCostUsd: Usd | null;
}

export interface DecisionCounts {
    readonly decisions: Count;
    readonly compacted: Count;
    readonly waited: Count;
}

export interface CoverageAmendment {
    readonly coverage: Readonly<Record<string, number>> | null;
    readonly outcome: CoverageOutcome;
    readonly coverageMs: Duration;
    readonly coverageCostUsd: Usd | null;
    readonly why: string | null;
    readonly block: boolean;
}

export interface AutocompactRecords {
    record(decision: Decision): DecisionId;
    link(id: DecisionId, compactionId: CompactionId): void;
    linkLatest(tab: TabId, pane: PaneId, compactionId: CompactionId): LinkedDecision | null;
    amend(id: DecisionId, update: CoverageAmendment): void;
    lastDecisionAt(tab: TabId, pane: PaneId): Instant | null;
    lastDecision(tab: TabId, pane: PaneId): LastDecision | null;
    markRequested(id: DecisionId): void;
    unlinkedCompactSince(tab: TabId, pane: PaneId, at: Instant): boolean;
    unlinkedCompactAny(at: Instant): boolean;
    pruneSkips(keep: readonly PaneKey[]): void;
    skip(skip: Skip): void;
    skips(): readonly Skip[];
    newest(limit: Count, tab?: TabId): readonly StoredDecision[];
    countsFor(tab: TabId): DecisionCounts;
    costSince(at: Instant): Usd;
}
