import { type DecidedAnswers, type Question } from '@stateforge-labs/session-ledger';
import { parseProbability, type Probability } from '@stateforge-labs/session-ledger';
import { parseUsd } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { parseTokenAmount } from '@stateforge-labs/session-ledger';
import { duration } from '@stateforge-labs/session-ledger';

export const textOf = (value: string): Text => must(parseText(value));

export const documentOf = (value: unknown): Text => textOf(JSON.stringify(value));

const probability = (value: number): Probability => {
    const found = parseProbability(value);
    if (found === null) throw new Error(`not a probability: ${value}`);
    return found;
};

export const probabilitiesOf = (answers: Readonly<Record<string, number>>): ReadonlyMap<Text, Probability> =>
    new Map(Object.entries(answers).map(([id, value]): [Text, Probability] => [textOf(id), probability(value)]));

export const noulOf = (instructions: string, whenTrue: string, whenFalse: string): Question => ({
    instructions: textOf(instructions),
    criteria: { true: textOf(whenTrue), false: textOf(whenFalse) },
});

export const decidedOf = (answers: Readonly<Record<string, number>>, extra: { readonly tokens?: number; readonly costUsd?: number; readonly tookMs?: number; readonly model?: string } = {}): DecidedAnswers => ({
    kind: 'decided',
    answers: probabilitiesOf(answers),
    tokens: must(parseTokenAmount(extra.tokens ?? 1)),
    costUsd: must(parseUsd(extra.costUsd ?? 0)),
    tookMs: duration(extra.tookMs ?? 1),
    model: textOf(extra.model ?? 'fake'),
});
