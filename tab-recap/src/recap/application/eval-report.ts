import type { RunRecord } from '#src/ports/run-inputs.ts';
import type { VerdictRecord } from '#src/ports/verdicts.ts';
import { must } from '#src/protocol/result.ts';
import { countOf, parseCount, type Count } from '#src/recap/domain/count.ts';
import { uncheckedRatio } from '#src/recap/domain/ids.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import type { RunId } from '#src/recap/domain/run-ids.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import { usdOf, type Usd } from '#src/recap/domain/usd.ts';
import type { Grade } from './judge-answer.ts';
import { plus } from './judge-coverage.ts';
import type { Measured } from './judge-coverage.ts';
import type { RunResult, Share } from './judge.ts';

export interface Rate {
    readonly check: Text;
    readonly passed: Count;
    readonly total: Count;
}

export interface Failure {
    readonly run: RunId;
    readonly key: Text;
    readonly text: Text;
    readonly check: Text;
    readonly critique: Text;
}

type CheckVerdict = Pick<VerdictRecord, 'check' | 'pass'>;

export type RunLine =
    | {
        readonly kind: 'judged'; readonly run: RunRecord; readonly coverage: Share; readonly filler: Share; readonly added: Measured['added']; readonly stateSize: Count
        readonly readback: readonly Grade[] | null; readonly note: Text | null;
    }
    | { readonly kind: 'not-judged'; readonly run: RunRecord; readonly why: Text };

export interface Totals {
    readonly coverage: Share;
    readonly filler: Share;
    readonly added: Measured['added'];
    readonly readback: Probability | null;
}

export interface EvalReport {
    readonly judge: Text;
    readonly rates: readonly Rate[];
    readonly failures: readonly Failure[];
    readonly judgeVsAnchor: readonly Failure[];
    readonly totals: Totals;
    readonly runs: readonly RunLine[];
    readonly costUsd: Usd;
}

const ITEM_CHECKS = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'].map(textOf);
const SECTION_CHECKS = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'rules', 'links'].map((section) => textOf(`S-${section}`));
const RUN_CHECKS = ['coverage', 'filler', ...[1, 2, 3, 4, 5, 6].map((n) => `readback-${n}`)].map(textOf);

export const CHECK_ORDER: readonly Text[] = [...ITEM_CHECKS, ...SECTION_CHECKS, ...RUN_CHECKS];

interface Checked {
    readonly check: Text;
}

export const inCheckOrder = <Row extends Checked>(rows: readonly Row[]): readonly Row[] =>
    [...CHECK_ORDER.flatMap((check) => rows.filter((row) => row.check === check)), ...rows.filter((row) => !CHECK_ORDER.includes(row.check))];

export const percent = (part: Count, whole: Count): Probability => uncheckedRatio(whole === 0 ? 0 : Math.round((100 * part) / whole));

function ratesOf(verdicts: readonly CheckVerdict[]): readonly Rate[] {
    const found = new Map<Text, { passed: Count; total: Count }>();
    for (const verdict of verdicts) {
        const rate = found.get(verdict.check) ?? { passed: countOf(0), total: countOf(0) };
        found.set(verdict.check, { passed: countOf(rate.passed + Number(verdict.pass === 'pass')), total: countOf(rate.total + 1) });
    }
    return inCheckOrder([...found].map(([check, rate]): Rate => ({ check, passed: rate.passed, total: rate.total })));
}

function failuresOf(results: readonly RunResult[]): readonly Failure[] {
    return results.flatMap((result) => {
        if (result.kind !== 'judged') {
            return [];
        }
        const text = new Map(result.items.map((item) => [item.key, item.text]));
        return result.verdicts.flatMap((verdict) => {
            const line = verdict.item === null ? undefined : text.get(verdict.item);
            return verdict.pass === 'pass' || verdict.item === null || line === undefined || !(ITEM_CHECKS.includes(verdict.check) || verdict.check.startsWith('S-'))
                ? []
                : [{ run: result.run.id, key: verdict.item, text: line, check: verdict.check, critique: verdict.critique ?? textOf('') }];
        });
    });
}

const lineOf = (result: RunResult): RunLine =>
    result.kind === 'judged'
        ? { kind: 'judged', run: result.run, coverage: result.coverage, filler: result.filler, added: result.added, stateSize: result.stateSize, readback: result.readback, note: result.note }
        : { kind: 'not-judged', run: result.run, why: result.why };

const NONE: Share = { passed: must(parseCount(0)), total: must(parseCount(0)) };

const medianOf = (counts: readonly Count[]): Probability | null => {
    const sorted = Float64Array.from(counts).toSorted();
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length === 0) {
        return null;
    }
    return uncheckedRatio(sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
};

export function totalsOf(results: readonly RunResult[]): Totals {
    const judged = results.flatMap((result) => (result.kind === 'judged' ? [result] : []));
    return {
        coverage: judged.reduce((sum, run) => plus(sum, run.coverage), NONE), filler: judged.reduce((sum, run) => plus(sum, run.filler), NONE),
        added: { coverage: judged.reduce((sum, run) => plus(sum, run.added.coverage), NONE), filler: judged.reduce((sum, run) => plus(sum, run.added.filler), NONE) },
        readback: medianOf(judged.flatMap((run) => (run.readback === null ? [] : [countOf(run.readback.filter((grade) => grade.pass).length)]))),
    };
}

function anchoredFailures(results: readonly RunResult[]): readonly Failure[] {
    return results.flatMap((result) => {
        if (result.kind !== 'judged') {
            return [];
        }
        const anchored = new Map(result.items.filter((item) => item.anchor !== null).map((item) => [item.key, item.text]));
        return result.verdicts.flatMap((verdict) => (verdict.check === 'I4' && verdict.pass === 'fail' && verdict.item !== null && anchored.has(verdict.item)
            ? [{ run: result.run.id, key: verdict.item, text: anchored.get(verdict.item) ?? textOf(''), check: textOf('I4'), critique: verdict.critique ?? textOf('') }]
            : []));
    });
}

export function reportOf(judge: Text, results: readonly RunResult[]): EvalReport {
    return {
        judge,
        rates: ratesOf(results.flatMap((result) => (result.kind === 'judged' ? result.verdicts : []))),
        failures: failuresOf(results),
        judgeVsAnchor: anchoredFailures(results),
        totals: totalsOf(results),
        runs: results.map(lineOf),
        costUsd: usdOf(results.reduce((sum, result) => sum + result.costUsd, 0)),
    };
}
