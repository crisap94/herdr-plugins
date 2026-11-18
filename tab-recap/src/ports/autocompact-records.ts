import { err, ok } from '#src/protocol/result.ts';
import type { Result } from '#src/protocol/result.ts';
import { parseLaneStatusAtDecision, SKIP_GATES } from '#src/recap/domain/autocompact.ts';
import type { CoverageOutcome, LaneStatusAtDecision, SkipGate, UncheckedReason } from '#src/recap/domain/autocompact.ts';
import { parseAgentKind, parseCompactionId, parseDecisionId, parsePaneId, parseTabId } from '#src/recap/domain/ids.ts';
import type { AgentKind, CompactionId, DecisionId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { parseDuration, parseInstant } from '#src/recap/domain/time.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';

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

const MODES: readonly DecisionMode[] = ['shadow', 'on'];
const GATES: readonly DecisionGate[] = ['ask', 'ceiling', 'coverage'];
const VERDICTS: readonly DecisionVerdict[] = ['compact', 'wait', 'undecided', 'unknown'];
const UNCHECKED_REASONS: readonly UncheckedReason[] = ['no-decider', 'decider-cannot-answer', 'no-brief'];

interface Row {
    readonly [key: string]: unknown;
}

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

type Tally = Readonly<Record<string, number>>;
type Placement = Pick<Skip, 'tab' | 'pane' | 'agent' | 'at'>;
type DecisionLocator = Pick<StoredDecision, 'id' | 'compactionId' | 'tab' | 'pane' | 'agent' | 'at' | 'laneStatus'>;
type DecisionReading = Pick<StoredDecision, 'mode' | 'share' | 'tokens' | 'window' | 'gate' | 'verdict' | 'askedVerdict'>;
type DecisionEvidence = Pick<StoredDecision, 'answers' | 'coverage' | 'decider' | 'costUsd' | 'tookMs'>;
type DecisionCoverage = Pick<StoredDecision, 'coverageOutcome' | 'coverageMs' | 'coverageCostUsd' | 'why'>;

const isTally = (input: unknown): input is Tally => isRow(input) && Object.values(input).every((count) => typeof count === 'number' && Number.isFinite(count));

export function parseStoredCoverageOutcome(input: unknown): Result<StoredCoverageOutcome, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    if (input.kind === 'passed') return ok({ kind: 'passed' });
    if (input.kind === 'missed') {
        const count = parseCount(input.count);
        return count.kind === 'err' ? count : ok({ kind: 'missed', count: count.value });
    }
    const reason = UNCHECKED_REASONS.find((value) => value === input.reason);
    if (input.kind !== 'unchecked' || reason === undefined) return err({ kind: 'out-of-range' });
    return ok({ kind: 'unchecked', reason });
}

function placementOf(row: Row): Result<Placement, ParseFailure> {
    const tab = parseTabId(row.tab);
    if (tab.kind === 'err') return tab;
    const pane = parsePaneId(row.pane);
    if (pane.kind === 'err') return pane;
    const agent = parseAgentKind(row.agent);
    if (agent.kind === 'err') return agent;
    const at = parseInstant(row.at);
    if (at.kind === 'err') return at;
    return ok({ tab: tab.value, pane: pane.value, agent: agent.value, at: at.value });
}

export function parseSkip(input: unknown): Result<Skip, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const placement = placementOf(input);
    if (placement.kind === 'err') return placement;
    const gate = SKIP_GATES.find((value) => value === input.gate);
    if (gate === undefined) return err({ kind: 'out-of-range' });
    const share = input.share === null ? ok(null) : parseCount(input.share);
    if (share.kind === 'err') return share;
    const detail = input.detail === null ? ok(null) : parseText(input.detail);
    if (detail.kind === 'err') return detail;
    return ok({ ...placement.value, gate, share: share.value, detail: detail.value });
}

function locatorOf(row: Row): Result<DecisionLocator, ParseFailure> {
    const id = parseDecisionId(row.id);
    if (id.kind === 'err') return id;
    const compactionId = row.compactionId === null ? ok(null) : parseCompactionId(row.compactionId);
    if (compactionId.kind === 'err') return compactionId;
    const placement = placementOf(row);
    if (placement.kind === 'err') return placement;
    const laneStatus = row.laneStatus === null ? null : parseLaneStatusAtDecision(row.laneStatus);
    if (row.laneStatus !== null && laneStatus === null) return err({ kind: 'out-of-range' });
    return ok({ id: id.value, compactionId: compactionId.value, ...placement.value, laneStatus });
}

function readingOf(row: Row): Result<DecisionReading, ParseFailure> {
    const mode = MODES.find((value) => value === row.mode);
    const gate = GATES.find((value) => value === row.gate);
    const verdict = VERDICTS.find((value) => value === row.verdict);
    const askedVerdict = row.askedVerdict === null ? null : VERDICTS.find((value) => value === row.askedVerdict);
    if (mode === undefined || gate === undefined || verdict === undefined || askedVerdict === undefined) return err({ kind: 'out-of-range' });
    const share = parseCount(row.share);
    if (share.kind === 'err') return share;
    const tokens = parseCount(row.tokens);
    if (tokens.kind === 'err') return tokens;
    const windowSize = parseCount(row.window);
    if (windowSize.kind === 'err') return windowSize;
    return ok({ mode, share: share.value, tokens: tokens.value, window: windowSize.value, gate, verdict, askedVerdict });
}

function evidenceOf(row: Row): Result<DecisionEvidence, ParseFailure> {
    const { answers, coverage } = row;
    if (!isTally(answers) || (coverage !== null && !isTally(coverage))) return err({ kind: 'not-a-number' });
    const decider = row.decider === null ? ok(null) : parseText(row.decider);
    if (decider.kind === 'err') return decider;
    const costUsd = parseUsd(row.costUsd);
    if (costUsd.kind === 'err') return costUsd;
    const tookMs = row.tookMs === null ? ok(null) : parseDuration(row.tookMs);
    if (tookMs.kind === 'err') return tookMs;
    return ok({ answers, coverage, decider: decider.value, costUsd: costUsd.value, tookMs: tookMs.value });
}

function coverageOf(row: Row): Result<DecisionCoverage, ParseFailure> {
    const coverageOutcome = row.coverageOutcome === null ? ok(null) : parseStoredCoverageOutcome(row.coverageOutcome);
    if (coverageOutcome.kind === 'err') return coverageOutcome;
    const coverageMs = row.coverageMs === null ? ok(null) : parseDuration(row.coverageMs);
    if (coverageMs.kind === 'err') return coverageMs;
    const coverageCostUsd = row.coverageCostUsd === null ? ok(null) : parseUsd(row.coverageCostUsd);
    if (coverageCostUsd.kind === 'err') return coverageCostUsd;
    const why = row.why === null ? ok(null) : parseText(row.why);
    if (why.kind === 'err') return why;
    return ok({ coverageOutcome: coverageOutcome.value, coverageMs: coverageMs.value, coverageCostUsd: coverageCostUsd.value, why: why.value });
}

export function parseStoredDecision(input: unknown): Result<StoredDecision, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const locator = locatorOf(input);
    if (locator.kind === 'err') return locator;
    const reading = readingOf(input);
    if (reading.kind === 'err') return reading;
    const evidence = evidenceOf(input);
    if (evidence.kind === 'err') return evidence;
    const coverage = coverageOf(input);
    if (coverage.kind === 'err') return coverage;
    return ok({ ...locator.value, ...reading.value, ...evidence.value, ...coverage.value });
}
