import { deciderInstructions } from '../../tab-recap/src/adapters/job/decider.ts';
import { KEPT_AT_LEAST, checkedFactsOf, probabilityRequired, questionsOf, unmetOf } from '../../tab-recap/src/recap/application/brief-coverage.ts';
import type { CheckedFact } from '../../packages/session-ledger/src/recap/domain/autocompact.ts';
import { parseProbability } from '../../packages/session-ledger/src/recap/domain/probability.ts';
import { textOf } from '../../packages/session-ledger/src/recap/domain/text.ts';
import type { HistoryFact } from '../../packages/session-ledger/src/ports/ledger.ts';
import type { Item, Prompt } from '../lib/types.ts';

export interface ExpectedQuestion {
    readonly kept: boolean;
    readonly how: string;
    readonly fact: string;
}

export interface Expected {
    readonly ok: boolean;
    readonly pass_mark: number;
    readonly facts_asked: number;
    readonly questions: Readonly<Record<string, ExpectedQuestion>>;
    readonly missing: readonly { readonly index: number; readonly parts: readonly string[] }[];
    readonly not_asked: readonly unknown[];
    readonly note: string;
}

export interface Input {
    readonly brief: string;
    readonly history: readonly HistoryFact[];
}

export type CoverageItem = Item<Input, Expected>;

export const factsFor = (item: CoverageItem): readonly CheckedFact[] => checkedFactsOf(item.input.history);

export const idsFor = (item: CoverageItem): string[] => Object.keys(questionsOf(factsFor(item)));

export const unmetBy = (answers: Readonly<Record<string, number>>, facts: readonly CheckedFact[], keptAtLeast: number = KEPT_AT_LEAST): ReturnType<typeof unmetOf> =>
    unmetOf(new Map(Object.entries(answers).map(([key, value]) => [textOf(key), probabilityRequired(parseProbability(value))] as const)), facts, probabilityRequired(parseProbability(keptAtLeast)));

export function prompt(item: CoverageItem): Prompt {
    const facts = factsFor(item);
    return {
        system: deciderInstructions(questionsOf(facts)),
        user: JSON.stringify({ brief: item.input.brief, facts: facts.map((fact) => ({ section: fact.section, text: fact.text, why: fact.why })) }),
    };
}
