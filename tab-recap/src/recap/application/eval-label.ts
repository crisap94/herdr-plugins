import type { RunInputs, StoredRun } from '#src/ports/run-inputs.ts';
import type { Verdict } from '#src/ports/verdicts.ts';
import { ITEM_CHECKS } from './judge-answer.ts';

export interface Candidate {
    readonly run: StoredRun;
    readonly key: string;
    readonly section: string;
    readonly text: string;
}

export function candidatesOf(runs: readonly StoredRun[], inputs: Pick<RunInputs, 'itemsOf'>, labelled: ReadonlySet<string>, count: number, check: string | null = null): readonly Candidate[] {
    const found: Candidate[] = [];
    for (const run of runs) {
        for (const item of inputs.itemsOf(run.id, 'added')) {
            if (found.length < count && !labelled.has(`${run.id}|${item.key}`) && (check === null || checksFor(item.section).includes(check))) {
                found.push({ run, key: item.key, section: item.section, text: item.text });
            }
        }
    }
    return found;
}

export type Answer =
    | { readonly kind: 'pass' }
    | { readonly kind: 'fail'; readonly checks: readonly string[] }
    | { readonly kind: 'skip' }
    | { readonly kind: 'quit' }
    | { readonly kind: 'again'; readonly why: string };

export const checksFor = (section: string): readonly string[] => [...ITEM_CHECKS, `S-${section}`];

const checkNamed = (part: string): string => (/^i\d$/u.test(part) ? part.toUpperCase() : `S-${part.replace(/^s-/u, '')}`);

const WORDS: Readonly<Record<string, Answer>> = { ok: { kind: 'pass' }, skip: { kind: 'skip' }, s: { kind: 'skip' }, quit: { kind: 'quit' }, q: { kind: 'quit' } };

export function answerOf(line: string, section: string, only: string | null = null): Answer {
    const [word = '', ...rest] = line.trim().toLowerCase().split(/[\s,]+/u).filter((part) => part !== '');
    const valid = only === null ? checksFor(section) : [only];
    const simple = WORDS[word];
    if (simple !== undefined && (rest.length === 0 || simple.kind === 'skip' || simple.kind === 'quit')) {
        return simple;
    }
    if (word !== 'fail' && word !== 'f') {
        return { kind: 'again', why: 'answer ok, fail [checks], skip or quit' };
    }
    return failedChecks(rest.map(checkNamed), valid);
}

function failedChecks(named: readonly string[], valid: readonly string[]): Answer {
    const wrong = named.find((check) => !valid.includes(check));
    return wrong === undefined ? { kind: 'fail', checks: named.length === 0 ? valid : named } : { kind: 'again', why: `${wrong} is not a check of this item (${valid.join(' ')})` };
}

const reasonOr = (reason: string): string => (reason === '' ? '(no reason given)' : reason);

export function labelVerdicts(candidate: Candidate, answer: Extract<Answer, { kind: 'pass' | 'fail' }>, reason: string, at: number, only: string | null = null): readonly Verdict[] {
    const failing = answer.kind === 'fail' ? answer.checks : [];
    return (only === null ? checksFor(candidate.section) : [only]).map((check): Verdict => ({
        run: candidate.run.id, item: candidate.key, check, pass: !failing.includes(check), critique: failing.includes(check) ? reasonOr(reason) : null,
        judge: 'operator', at, source: 'operator',
    }));
}
