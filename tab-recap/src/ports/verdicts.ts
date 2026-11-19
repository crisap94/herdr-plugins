import { err, ok, type Result } from '#src/protocol/result.ts';
import type { RunId } from '#src/recap/domain/fact.ts';
import { parseRunId } from '#src/recap/domain/run-ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseInstant, type Instant } from '#src/recap/domain/time.ts';
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

const SOURCES: readonly VerdictRecord['source'][] = ['judge', 'operator'];

export function parsePairRecord(input: unknown): Result<PairRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const check = parseText(input.check);
    if (check.kind === 'err') return check;
    const judge = OUTCOMES.find((option) => option === input.judge);
    const operator = OUTCOMES.find((option) => option === input.operator);
    if (judge === undefined || operator === undefined) return err({ kind: 'out-of-range' });
    return ok({ check: check.value, judge, operator });
}

export function parseVerdictRecord(input: unknown): Result<VerdictRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const run = parseRunId(input.run);
    if (run.kind === 'err') return run;
    const item = input.item === null ? ok(null) : parseText(input.item);
    if (item.kind === 'err') return item;
    const check = parseText(input.check);
    if (check.kind === 'err') return check;
    const pass = OUTCOMES.find((option) => option === input.pass);
    if (pass === undefined) return err({ kind: 'out-of-range' });
    const critique = input.critique === null ? ok(null) : parseText(input.critique);
    if (critique.kind === 'err') return critique;
    const judge = parseText(input.judge);
    if (judge.kind === 'err') return judge;
    const at = parseInstant(input.at);
    if (at.kind === 'err') return at;
    const source = SOURCES.find((option) => option === input.source);
    if (source === undefined) return err({ kind: 'out-of-range' });
    return ok({
        run: run.value,
        item: item.value,
        check: check.value,
        pass,
        critique: critique.value,
        judge: judge.value,
        at: at.value,
        source,
    });
}

export function parseDisagreementRecord(input: unknown): Result<DisagreementRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const run = parseRunId(input.run);
    if (run.kind === 'err') return run;
    const item = parseText(input.item);
    if (item.kind === 'err') return item;
    const check = parseText(input.check);
    if (check.kind === 'err') return check;
    const judge = OUTCOMES.find((option) => option === input.judge);
    const operator = OUTCOMES.find((option) => option === input.operator);
    if (judge === undefined || operator === undefined) return err({ kind: 'out-of-range' });
    const judgeCritique = input.judgeCritique === null ? ok(null) : parseText(input.judgeCritique);
    if (judgeCritique.kind === 'err') return judgeCritique;
    const reason = input.reason === null ? ok(null) : parseText(input.reason);
    if (reason.kind === 'err') return reason;
    const at = parseInstant(input.at);
    if (at.kind === 'err') return at;
    return ok({
        run: run.value,
        item: item.value,
        check: check.value,
        judge,
        operator,
        judgeCritique: judgeCritique.value,
        reason: reason.value,
        at: at.value,
    });
}
