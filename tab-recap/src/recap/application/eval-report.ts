// The eval's report on a sample of judged runs: pass rate per check, the failing items, coverage, no-filler and read-back per run. Pure.
import type { StoredRun } from '#src/ports/run-inputs.ts';
import type { Grade } from './judge-answer.ts';
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

/** What the report says of one sampled run. */
export type RunLine =
    | { readonly kind: 'judged'; readonly run: StoredRun; readonly coverage: Share; readonly filler: Share; readonly readback: readonly Grade[] | null; readonly note: string | null }
    | { readonly kind: 'not-judged'; readonly run: StoredRun; readonly why: string };

export interface EvalReport {
    readonly judge: string;
    readonly rates: readonly Rate[];
    readonly failures: readonly Failure[];
    readonly runs: readonly RunLine[];
    readonly costUsd: number;
}

const ITEM_CHECKS = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'];
const SECTION_CHECKS = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'rules', 'links'].map((section) => `S-${section}`);
const RUN_CHECKS = ['coverage', 'filler', ...[1, 2, 3, 4, 5, 6].map((n) => `readback-${n}`)];

/** The order checks are listed in: item checks, section checks, then the whole recap's. */
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
        ? { kind: 'judged', run: result.run, coverage: result.coverage, filler: result.filler, readback: result.readback, note: result.note }
        : { kind: 'not-judged', run: result.run, why: result.why };

/** The report for the results of one eval, by the judge named `judge`. */
export function reportOf(judge: string, results: readonly RunResult[]): EvalReport {
    return {
        judge,
        rates: ratesOf(results.flatMap((result) => (result.kind === 'judged' ? result.verdicts : []))),
        failures: failuresOf(results),
        runs: results.map(lineOf),
        costUsd: results.reduce((sum, result) => sum + result.costUsd, 0),
    };
}
