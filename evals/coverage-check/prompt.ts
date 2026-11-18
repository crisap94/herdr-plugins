import { deciderInstructions } from '../../tab-recap/src/adapters/job/decider.ts';
import { factsOf, questionsFor } from '../../tab-recap/src/recap/application/brief-coverage.ts';
import type { CoverageFact } from '../../tab-recap/src/recap/application/brief-coverage.ts';
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

export const factsFor = (item: CoverageItem): readonly CoverageFact[] => factsOf(item.input.history);

export const idsFor = (item: CoverageItem): string[] => Object.keys(questionsFor(factsFor(item)));

export function prompt(item: CoverageItem): Prompt {
    const facts = factsFor(item);
    return {
        system: deciderInstructions(questionsFor(facts)),
        user: JSON.stringify({ brief: item.input.brief, facts: facts.map((fact) => ({ section: fact.section, text: fact.text, why: fact.why })) }),
    };
}
