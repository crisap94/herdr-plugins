import type { Count } from '#src/recap/domain/count.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Milliseconds } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { Unknown } from './unknowable.ts';

export interface NoulCriteria {
    readonly true: Text;
    readonly false: Text;
}

export interface Noul {
    readonly instructions: Text;
    readonly criteria: NoulCriteria;
}

export interface Decided {
    readonly kind: 'decided';
    readonly answers: ReadonlyMap<Text, Probability>;
    readonly tokens: Count;
    readonly costUsd: Usd;
    readonly tookMs: Milliseconds;
    readonly model: Text;
}

export type DecidedResult = Decided | Unknown;

export interface Decider {
    readonly label: Text;
    ask(state: Text, questions: ReadonlyMap<Text, Noul>): Promise<DecidedResult>;
}
