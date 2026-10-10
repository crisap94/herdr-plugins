import type { StoredRun } from '#src/ports/run-inputs.ts';
import type { Grade } from './judge-answer.ts';
import { plus } from './judge-coverage.ts';
import type { Measured } from './judge-coverage.ts';
import type { RunResult, Share } from './judge.ts';

export interface Rate {
    readonly check: string;
    readonly passed: number;
    readonly total: number;
}

export interface Failure {
    readonly run: string;
    readonly key: string;
    readonly text: string;
    readonly check: string;
    readonly critique: string;
}

export type RunLine =
    | {
        readonly kind: 'judged'; readonly run: StoredRun; readonly coverage: Share; readonly filler: Share; readonly added: Measured['added']; readonly stateSize: number
        readonly readback: readonly Grade[] | null; readonly note: string | null;
    }
    | { readonly kind: 'not-judged'; readonly run: StoredRun; readonly why: string };

export interface Totals {
    readonly coverage: Share;
    readonly filler: Share;
    readonly added: Measured['added'];
    readonly readback: number | null;
}

export interface EvalReport {
    readonly judge: string;
    readonly rates: readonly Rate[];
    readonly failures: readonly Failure[];
    readonly judgeVsAnchor: readonly Failure[];
    readonly totals: Totals;
    readonly runs: readonly RunLine[];
    readonly costUsd: number;
}

const ITEM_CHECKS = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'];
const SECTION_CHECKS = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'rules', 'links'].map((section) => `S-${section}`);
const RUN_CHECKS = ['coverage', 'filler', ...[1, 2, 3, 4, 5, 6].map((n) => `readback-${n}`)];

export const CHECK_ORDER: readonly string[] = [...ITEM_CHECKS, ...SECTION_CHECKS, ...RUN_CHECKS];

export const rankOf = (check: string): number => {
    const at = CHECK_ORDER.indexOf(check);
    return at < 0 ? CHECK_ORDER.length : at;
};

export const percent = (part: number, whole: number): number => (whole === 0 ? 0 : Math.round((100 * part) / whole));

function ratesOf(verdicts: readonly { readonly check: string; readonly pass: boolean }[]): readonly Rate[] {
    const found = new Map<string, { passed: number; total: number }>();
    for (const verdict of verdicts) {
        const rate = found.get(verdict.check) ?? { passed: 0, total: 0 };
        found.set(verdict.check, { passed: rate.passed + Number(verdict.pass), total: rate.total + 1 });
    }
    return [...found].map(([check, rate]): Rate => ({ check, passed: rate.passed, total: rate.total })).toSorted((a, b) => rankOf(a.check) - rankOf(b.check));
}

function failuresOf(results: readonly RunResult[]): readonly Failure[] {
    return results.flatMap((result) => {
        if (result.kind !== 'judged') {
            return [];
        }
        const text = new Map(result.items.map((item) => [item.key, item.text]));
        return result.verdicts.flatMap((verdict) => {
            const line = verdict.item === null ? undefined : text.get(verdict.item);
            return verdict.pass || verdict.item === null || line === undefined || !(ITEM_CHECKS.includes(verdict.check) || verdict.check.startsWith('S-'))
                ? []
                : [{ run: result.run.id, key: verdict.item, text: line, check: verdict.check, critique: verdict.critique ?? '' }];
        });
    });
}

const lineOf = (result: RunResult): RunLine =>
    result.kind === 'judged'
        ? { kind: 'judged', run: result.run, coverage: result.coverage, filler: result.filler, added: result.added, stateSize: result.stateSize, readback: result.readback, note: result.note }
        : { kind: 'not-judged', run: result.run, why: result.why };

const NONE: Share = { passed: 0, total: 0 };

const medianOf = (numbers: readonly number[]): number | null => {
    const sorted = numbers.toSorted((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length === 0) {
        return null;
    }
    return sorted.length % 2 === 1 ? (sorted[middle] ?? null) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

export function totalsOf(results: readonly RunResult[]): Totals {
    const judged = results.flatMap((result) => (result.kind === 'judged' ? [result] : []));
    return {
        coverage: judged.reduce((sum, run) => plus(sum, run.coverage), NONE), filler: judged.reduce((sum, run) => plus(sum, run.filler), NONE),
        added: { coverage: judged.reduce((sum, run) => plus(sum, run.added.coverage), NONE), filler: judged.reduce((sum, run) => plus(sum, run.added.filler), NONE) },
        readback: medianOf(judged.flatMap((run) => (run.readback === null ? [] : [run.readback.filter((grade) => grade.pass).length]))),
    };
}

function anchoredFailures(results: readonly RunResult[]): readonly Failure[] {
    return results.flatMap((result) => {
        if (result.kind !== 'judged') {
            return [];
        }
        const anchored = new Map(result.items.filter((item) => item.anchor !== null).map((item) => [item.key, item.text]));
        return result.verdicts.flatMap((verdict) => (verdict.check === 'I4' && !verdict.pass && verdict.item !== null && anchored.has(verdict.item)
            ? [{ run: result.run.id, key: verdict.item, text: anchored.get(verdict.item) ?? '', check: 'I4', critique: verdict.critique ?? '' }]
            : []));
    });
}

export function reportOf(judge: string, results: readonly RunResult[]): EvalReport {
    return {
        judge,
        rates: ratesOf(results.flatMap((result) => (result.kind === 'judged' ? result.verdicts : []))),
        failures: failuresOf(results),
        judgeVsAnchor: anchoredFailures(results),
        totals: totalsOf(results),
        runs: results.map(lineOf),
        costUsd: results.reduce((sum, result) => sum + result.costUsd, 0),
    };
}
