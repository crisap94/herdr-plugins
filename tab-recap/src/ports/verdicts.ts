import { err, ok, type Result } from '#src/protocol/result.ts';
import type { RunId } from '#src/recap/domain/fact.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
export type { Disagreement, Pair, Verdict, Verdicts, VerdictSource } from './twins/verdicts/legacy.ts';

export type Outcome = 'pass' | 'fail';

export interface VerdictRecord {
    readonly run: RunId;
    readonly item: Text | null;
    readonly check: Text;
    readonly pass: Outcome;
    readonly critique: Text | null;
    readonly judge: Text;
    readonly at: Instant;
    readonly source: 'judge' | 'operator';
}

export interface PairRecord {
    readonly check: Text;
    readonly judge: Outcome;
    readonly operator: Outcome;
}

export interface DisagreementRecord {
    readonly run: RunId;
    readonly item: Text;
    readonly check: Text;
    readonly judge: Outcome;
    readonly operator: Outcome;
    readonly judgeCritique: Text | null;
    readonly reason: Text | null;
    readonly at: Instant;
}

export interface VerdictStore {
    add(verdicts: readonly VerdictRecord[]): void;
    ofRun(run: RunId): readonly VerdictRecord[];
    labelled(check?: Text | null): ReadonlySet<Text>;
    pairs(): readonly PairRecord[];
    disagreements(): readonly DisagreementRecord[];
}

type Row = Record<string, unknown>;

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

const OUTCOMES: readonly Outcome[] = ['pass', 'fail'];

export function parsePairRecord(input: unknown): Result<PairRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const check = parseText(input.check);
    if (check.kind === 'err') return check;
    const judge = OUTCOMES.find((option) => option === input.judge);
    const operator = OUTCOMES.find((option) => option === input.operator);
    if (judge === undefined || operator === undefined) return err({ kind: 'out-of-range' });
    return ok({ check: check.value, judge, operator });
}
