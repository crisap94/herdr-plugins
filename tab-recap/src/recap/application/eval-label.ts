// `eval --label`: which items the operator is asked about, how an answer line is read, and the verdicts it makes. Pure; the terminal is the CLI's.
import type { RunInputs, StoredRun } from '#src/ports/run-inputs.ts';
import type { Verdict } from '#src/ports/verdicts.ts';
import { ITEM_CHECKS } from './judge-answer.ts';

/** One item shown to the operator, with where it came from. */
export interface Candidate {
    readonly run: StoredRun;
    readonly key: string;
    readonly section: string;
    readonly text: string;
}

/** The newest `count` items no operator verdict names yet, from the newest runs first. `labelled` is `<run>|<item>` of the items already done. */
export function candidatesOf(runs: readonly StoredRun[], inputs: Pick<RunInputs, 'itemsOf'>, labelled: ReadonlySet<string>, count: number): readonly Candidate[] {
    const found: Candidate[] = [];
    for (const run of runs) {
        for (const item of inputs.itemsOf(run.id)) {
            if (found.length < count && !labelled.has(`${run.id}|${item.key}`)) {
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

/** The checks an item is judged on: the seven item checks and its own section's. */
export const checksFor = (section: string): readonly string[] => [...ITEM_CHECKS, `S-${section}`];

/** A check as the operator typed it: `i3`, `S-done`, or just `done`. */
const checkNamed = (part: string): string => (/^i\d$/u.test(part) ? part.toUpperCase() : `S-${part.replace(/^s-/u, '')}`);

const WORDS: Readonly<Record<string, Answer>> = { ok: { kind: 'pass' }, skip: { kind: 'skip' }, s: { kind: 'skip' }, quit: { kind: 'quit' }, q: { kind: 'quit' } };

/**
 * `ok` · `fail` (every check fails) · `fail I3 S-done` (those fail, the rest pass; a bare section name works) · `skip` · `quit`.
 * Whatever else is asked again, saying why.
 */
export function answerOf(line: string, section: string): Answer {
    const [word = '', ...rest] = line.trim().toLowerCase().split(/[\s,]+/u).filter((part) => part !== '');
    const valid = checksFor(section);
    const simple = WORDS[word];
    if (simple !== undefined && (rest.length === 0 || simple.kind === 'skip' || simple.kind === 'quit')) {
        return simple;
    }
    if (word !== 'fail' && word !== 'f') {
        return { kind: 'again', why: 'answer ok, fail [checks], skip or quit' };
    }
    const named = rest.map(checkNamed);
    const wrong = named.find((check) => !valid.includes(check));
    return wrong === undefined ? { kind: 'fail', checks: named.length === 0 ? valid : named } : { kind: 'again', why: `${wrong} is not a check of this item (${valid.join(' ')})` };
}

const reasonOr = (reason: string): string => (reason === '' ? '(no reason given)' : reason);

/** One operator verdict per check of the item: the named ones fail with the reason, the others pass. */
export function labelVerdicts(candidate: Candidate, answer: Extract<Answer, { kind: 'pass' | 'fail' }>, reason: string, at: number): readonly Verdict[] {
    const failing = answer.kind === 'fail' ? answer.checks : [];
    return checksFor(candidate.section).map((check): Verdict => ({
        run: candidate.run.id, item: candidate.key, check, pass: !failing.includes(check), critique: failing.includes(check) ? reasonOr(reason) : null,
        judge: 'operator', at, source: 'operator',
    }));
}
