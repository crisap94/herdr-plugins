import type { RunInputs, StoredRun } from '#src/ports/run-inputs.ts';
import type { Verdict } from '#src/ports/verdicts.ts';
import { must } from '#src/protocol/result.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { isSection, type Section } from '#src/recap/domain/fact.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { ITEM_CHECKS } from './judge-answer.ts';

export interface Candidate {
    readonly run: StoredRun;
    readonly key: Text;
    readonly section: Section;
    readonly text: Text;
}

const ITEM_TEXTS = ITEM_CHECKS.map((check) => must(parseText(check)));

export function candidatesOf(runs: readonly StoredRun[], inputs: Pick<RunInputs, 'itemsOf'>, labelled: ReadonlySet<Text>, count: Count, check: Text | null = null): readonly Candidate[] {
    const found: Candidate[] = [];
    for (const run of runs) {
        for (const item of inputs.itemsOf(run.id, 'added')) {
            if (found.length < count && !labelled.has(must(parseText(`${run.id}|${item.key}`))) && isSection(item.section) && (check === null || checksFor(item.section).includes(check))) {
                found.push({ run, key: must(parseText(item.key)), section: item.section, text: must(parseText(item.text)) });
            }
        }
    }
    return found;
}

interface PassAnswer {
    readonly kind: 'pass';
}

interface FailAnswer {
    readonly kind: 'fail';
    readonly checks: readonly Text[];
}

interface SkipAnswer {
    readonly kind: 'skip';
}

interface QuitAnswer {
    readonly kind: 'quit';
}

interface AgainAnswer {
    readonly kind: 'again';
    readonly why: Text;
}

export type Answer = PassAnswer | FailAnswer | SkipAnswer | QuitAnswer | AgainAnswer;

export const checksFor = (section: Section): readonly Text[] => [...ITEM_TEXTS, must(parseText(`S-${section}`))];

const WORDS: Readonly<Record<string, Answer>> = { ok: { kind: 'pass' }, skip: { kind: 'skip' }, s: { kind: 'skip' }, quit: { kind: 'quit' }, q: { kind: 'quit' } };

export function answerOf(line: Text, section: Section, only: Text | null = null): Answer {
    const [word = '', ...rest] = line.trim().toLowerCase().split(/[\s,]+/u).filter((part) => part !== '');
    const valid = only === null ? checksFor(section) : [only];
    const simple = WORDS[word];
    if (simple !== undefined && (rest.length === 0 || simple.kind === 'skip' || simple.kind === 'quit')) {
        return simple;
    }
    if (word !== 'fail' && word !== 'f') {
        return { kind: 'again', why: must(parseText('answer ok, fail [checks], skip or quit')) };
    }
    return failedChecks(rest.map((part) => must(parseText(/^i\d$/u.test(part) ? part.toUpperCase() : `S-${part.replace(/^s-/u, '')}`))), valid);
}

function failedChecks(named: readonly Text[], valid: readonly Text[]): Answer {
    const wrong = named.find((check) => !valid.includes(check));
    return wrong === undefined ? { kind: 'fail', checks: named.length === 0 ? valid : named } : { kind: 'again', why: must(parseText(`${wrong} is not a check of this item (${valid.join(' ')})`)) };
}

export function labelVerdicts(candidate: Candidate, answer: Extract<Answer, { kind: 'pass' | 'fail' }>, reason: Text, at: Instant, only: Text | null = null): readonly Verdict[] {
    const failing = answer.kind === 'fail' ? answer.checks : [];
    const note = reason === '' ? '(no reason given)' : reason;
    return (only === null ? checksFor(candidate.section) : [only]).map((check): Verdict => ({
        run: candidate.run.id, item: candidate.key, check, pass: !failing.includes(check), critique: failing.includes(check) ? note : null,
        judge: 'operator', at, source: 'operator',
    }));
}
