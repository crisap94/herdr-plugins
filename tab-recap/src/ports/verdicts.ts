import { err, ok, type Result } from '@stateforge-labs/session-ledger';
import type { RunId } from '@stateforge-labs/session-ledger';
import { parseRunId } from '#src/recap/domain/run-ids.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { parseInstant, type Instant } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';

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

function itemOf(row: Row): Result<Text | null, ParseFailure> {
    return row.item === null ? ok(null) : parseText(row.item);
}

function critiqueOf(row: Row): Result<Text | null, ParseFailure> {
    return row.critique === null ? ok(null) : parseText(row.critique);
}

function judgeCritiqueOf(row: Row): Result<Text | null, ParseFailure> {
    return row.judgeCritique === null ? ok(null) : parseText(row.judgeCritique);
}

function reasonOf(row: Row): Result<Text | null, ParseFailure> {
    return row.reason === null ? ok(null) : parseText(row.reason);
}

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
    const item = itemOf(input);
    if (item.kind === 'err') return item;
    const check = parseText(input.check);
    if (check.kind === 'err') return check;
    const pass = OUTCOMES.find((option) => option === input.pass);
    if (pass === undefined) return err({ kind: 'out-of-range' });
    const critique = critiqueOf(input);
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
    const judgeCritique = judgeCritiqueOf(input);
    if (judgeCritique.kind === 'err') return judgeCritique;
    const reason = reasonOf(input);
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
