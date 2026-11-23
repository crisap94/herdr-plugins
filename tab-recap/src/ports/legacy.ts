import type { AgentKind, CompactionId, DecisionId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';
import type { CoverageOutcome, LaneStatusAtDecision, SkipGate } from '#src/recap/domain/autocompact.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { Shape } from '#src/recap/domain/board.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';
import type { ClosedEvery, ColumnLayoutResult, Done, OpenResult, ResizeDirection } from './columns.ts';
import type { DecisionCounts, DecisionGate, DecisionMode, DecisionVerdict, LinkedDecision, PaneKey, PassedCoverage, UncheckedCoverage } from './autocompact-records.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Noul } from './decider.ts';

export interface MissedCoverage {
    readonly kind: 'missed';
    readonly count: number;
}

export type StoredCoverageOutcome = PassedCoverage | MissedCoverage | UncheckedCoverage;

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

export interface Columns {
    layout(tab: TabId): Promise<ColumnLayoutResult>;
    open(tab: TabId, target: Text, shape: Shape): Promise<OpenResult>;
    resize(pane: PaneId, direction: ResizeDirection, amount: Probability): Promise<Done>;
    close(pane: PaneId): Promise<Done>;
    closeEvery(): Promise<ClosedEvery>;
}

export interface Decided {
    readonly kind: 'decided';
    readonly answers: ReadonlyMap<Text, Probability>;
    readonly tokens: number;
    readonly costUsd: Usd;
    readonly tookMs: Duration;
    readonly model: Text;
}

export type DecidedResult = Decided | Unknown;

export interface Decider {
    readonly label: Text;
    ask(state: Text, questions: ReadonlyMap<Text, Noul>): Promise<DecidedResult>;
}

export interface LaneTokens {
    report(pane: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done>;
}

