import { err, ok } from '#src/protocol/result.ts';
import type { Result } from '#src/protocol/result.ts';
import { parseLaneStatusAtDecision, SKIP_GATES } from '#src/recap/domain/autocompact.ts';
import type { CheckedFact, LaneStatusAtDecision, SkipGate, UncheckedReason } from '#src/recap/domain/autocompact.ts';
import { parseCompactionId, parseDecisionId, parseHarnessKind, parseScopeId, parseSessionKey } from '#src/recap/domain/timing-ids.ts';
import type { HarnessKind, CompactionId, DecisionId, SessionKey, ScopeId } from '#src/recap/domain/timing-ids.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import { parseProbability } from '#src/recap/domain/probability.ts';
import { parseDuration, parseInstant } from '#src/recap/domain/time.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';

export type DecisionMode = 'shadow' | 'on';
export type DecisionGate = 'ask' | 'ceiling' | 'coverage';
export type Verdict = 'compact' | 'wait' | 'undecided' | 'unknown';
export type { SkipGate };
export interface PassedCoverage {
    readonly kind: 'passed';
}
export interface CoverageMissed {
    readonly kind: 'missed';
    readonly count: Count;
}
export interface UncheckedCoverage {
    readonly kind: 'unchecked';
    readonly reason: UncheckedReason;
}
export type CoverageRecord = PassedCoverage | CoverageMissed | UncheckedCoverage;
export interface ScopedKey {
    readonly scope: ScopeId;
    readonly key: SessionKey;
}
export interface LinkedDecision {
    readonly id: DecisionId;
    readonly gate: DecisionGate;
}

export interface SkipRow {
    readonly scope: ScopeId;
    readonly key: SessionKey;
    readonly agent: HarnessKind;
    readonly at: Instant;
    readonly gate: SkipGate;
    readonly share: Count | null;
    readonly detail: Text | null;
}

export interface LastDecisionRow {
    readonly at: Instant;
    readonly tokens: Count;
    readonly mode: DecisionMode;
    readonly verdict: Verdict;
    readonly gate: DecisionGate;
}

export interface CoverageFacts {
    readonly kind: 'missed';
    readonly facts: readonly CheckedFact[];
}

export type CoverageVerdict = PassedCoverage | CoverageFacts | UncheckedCoverage;

export type AnswerTally = ReadonlyMap<Text, Probability>;

export interface DecisionDraft {
    readonly scope: ScopeId;
    readonly key: SessionKey;
    readonly agent: HarnessKind;
    readonly at: Instant;
    readonly mode: DecisionMode;
    readonly share: Count;
    readonly tokens: Count;
    readonly window: Count;
    readonly gate: DecisionGate;
    readonly verdict: Verdict;
    readonly askedVerdict: Verdict | null;
    readonly answers: AnswerTally;
    readonly coverage: AnswerTally | null;
    readonly decider: Text | null;
    readonly costUsd: Usd;
    readonly tookMs: Duration | null;
    readonly why: Text | null;
    readonly laneStatus: LaneStatusAtDecision | null;
    readonly coverageOutcome: CoverageVerdict | null;
    readonly coverageMs: Duration | null;
    readonly coverageCostUsd: Usd | null;
}

export interface StoredDecisionRow extends Omit<DecisionDraft, 'coverageOutcome' | 'coverageMs' | 'coverageCostUsd'> {
    readonly id: DecisionId;
    readonly compactionId: CompactionId | null;
    readonly coverageOutcome: CoverageRecord | null;
    readonly coverageMs: Duration | null;
    readonly coverageCostUsd: Usd | null;
}

export interface DecisionCounts {
    readonly decisions: Count;
    readonly compacted: Count;
    readonly waited: Count;
}

export type CoverageBlock = 'blocks' | 'allows';

export interface CoverageRevision {
    readonly coverage: AnswerTally | null;
    readonly outcome: CoverageVerdict;
    readonly coverageMs: Duration;
    readonly coverageCostUsd: Usd | null;
    readonly why: Text | null;
    readonly block: CoverageBlock;
}

export type UnlinkedCompact = 'unlinked' | 'none';

export interface DecisionLedger {
    record(decision: DecisionDraft): DecisionId;
    link(id: DecisionId, compactionId: CompactionId): void;
    linkLatest(scope: ScopeId, key: SessionKey, compactionId: CompactionId): LinkedDecision | null;
    amend(id: DecisionId, update: CoverageRevision): void;
    lastDecisionAt(scope: ScopeId, key: SessionKey): Instant | null;
    lastDecision(scope: ScopeId, key: SessionKey): LastDecisionRow | null;
    markRequested(id: DecisionId): void;
    unlinkedCompactSince(scope: ScopeId, key: SessionKey, at: Instant): UnlinkedCompact;
    unlinkedCompactAny(at: Instant): UnlinkedCompact;
    pruneSkips(keep: readonly ScopedKey[]): void;
    skip(skip: SkipRow): void;
    skips(): readonly SkipRow[];
    newest(limit: Count, scope?: ScopeId): readonly StoredDecisionRow[];
    countsFor(scope: ScopeId): DecisionCounts;
    costSince(at: Instant): Usd;
}

const MODES: readonly DecisionMode[] = ['shadow', 'on'];
const GATES: readonly DecisionGate[] = ['ask', 'ceiling', 'coverage'];
const VERDICTS: readonly Verdict[] = ['compact', 'wait', 'undecided', 'unknown'];
const UNCHECKED_REASONS: readonly UncheckedReason[] = ['no-decider', 'decider-cannot-answer', 'no-brief'];

interface Row {
    readonly [key: string]: unknown;
}

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

type Placement = Pick<SkipRow, 'scope' | 'key' | 'agent' | 'at'>;
type DecisionLocator = Pick<StoredDecisionRow, 'id' | 'compactionId' | 'scope' | 'key' | 'agent' | 'at' | 'laneStatus'>;
type DecisionReading = Pick<StoredDecisionRow, 'mode' | 'share' | 'tokens' | 'window' | 'gate' | 'verdict' | 'askedVerdict'>;
type DecisionEvidence = Pick<StoredDecisionRow, 'answers' | 'coverage' | 'decider' | 'costUsd' | 'tookMs'>;
type DecisionCoverage = Pick<StoredDecisionRow, 'coverageOutcome' | 'coverageMs' | 'coverageCostUsd' | 'why'>;

export function parseAnswerTally(input: unknown): Result<AnswerTally, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-number' });
    const tally = new Map<Text, Probability>();
    for (const [key, value] of Object.entries(input)) {
        const name = parseText(key);
        const share = parseProbability(value);
        if (name.kind === 'err' || share === null) return err({ kind: 'not-a-number' });
        tally.set(name.value, share);
    }
    return ok(tally);
}

export function parseCoverageRecord(input: unknown): Result<CoverageRecord, ParseFailure> {
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
    const scope = parseScopeId(row.tab);
    if (scope.kind === 'err') return scope;
    const key = parseSessionKey(row.pane);
    if (key.kind === 'err') return key;
    const agent = parseHarnessKind(row.agent);
    if (agent.kind === 'err') return agent;
    const at = parseInstant(row.at);
    if (at.kind === 'err') return at;
    return ok({ scope: scope.value, key: key.value, agent: agent.value, at: at.value });
}

export function parseSkipRow(input: unknown): Result<SkipRow, ParseFailure> {
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
    const answers = parseAnswerTally(row.answers);
    if (answers.kind === 'err') return answers;
    const coverage = row.coverage === null ? ok(null) : parseAnswerTally(row.coverage);
    if (coverage.kind === 'err') return coverage;
    const decider = row.decider === null ? ok(null) : parseText(row.decider);
    if (decider.kind === 'err') return decider;
    const costUsd = parseUsd(row.costUsd);
    if (costUsd.kind === 'err') return costUsd;
    const tookMs = row.tookMs === null ? ok(null) : parseDuration(row.tookMs);
    if (tookMs.kind === 'err') return tookMs;
    return ok({ answers: answers.value, coverage: coverage.value, decider: decider.value, costUsd: costUsd.value, tookMs: tookMs.value });
}

function coverageOf(row: Row): Result<DecisionCoverage, ParseFailure> {
    const coverageOutcome = row.coverageOutcome === null ? ok(null) : parseCoverageRecord(row.coverageOutcome);
    if (coverageOutcome.kind === 'err') return coverageOutcome;
    const coverageMs = row.coverageMs === null ? ok(null) : parseDuration(row.coverageMs);
    if (coverageMs.kind === 'err') return coverageMs;
    const coverageCostUsd = row.coverageCostUsd === null ? ok(null) : parseUsd(row.coverageCostUsd);
    if (coverageCostUsd.kind === 'err') return coverageCostUsd;
    const why = row.why === null ? ok(null) : parseText(row.why);
    if (why.kind === 'err') return why;
    return ok({ coverageOutcome: coverageOutcome.value, coverageMs: coverageMs.value, coverageCostUsd: coverageCostUsd.value, why: why.value });
}

export function parseStoredDecisionRow(input: unknown): Result<StoredDecisionRow, ParseFailure> {
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
