import { type Decided, type Noul } from '#src/ports/decider.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { duration } from '#src/recap/domain/time.ts';

export const textOf = (value: string): Text => must(parseText(value));

export const documentOf = (value: unknown): Text => textOf(JSON.stringify(value));

const probability = (value: number): Probability => {
    const found = parseProbability(value);
    if (found === null) throw new Error(`not a probability: ${value}`);
    return found;
};

export const probabilitiesOf = (answers: Readonly<Record<string, number>>): ReadonlyMap<Text, Probability> =>
    new Map(Object.entries(answers).map(([id, value]): [Text, Probability] => [textOf(id), probability(value)]));

export const decidedOf = (answers: Readonly<Record<string, number>>, extra: { readonly tokens?: number; readonly costUsd?: number; readonly tookMs?: number; readonly model?: string } = {}): Decided => ({
    kind: 'decided',
    answers: probabilitiesOf(answers),
    tokens: extra.tokens ?? 1,
    costUsd: must(parseUsd(extra.costUsd ?? 0)),
    tookMs: duration(extra.tookMs ?? 1),
    model: textOf(extra.model ?? 'fake'),
});

export const noulOf = (instructions: string, whenTrue: string, whenFalse: string): Noul => ({
    instructions: textOf(instructions),
    criteria: { true: textOf(whenTrue), false: textOf(whenFalse) },
});
