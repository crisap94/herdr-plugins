import type { Count } from '#src/recap/domain/count.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Duration } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export type { Decided, DecidedResult, Decider } from './legacy.ts';

export interface NoulCriteria {
    readonly true: Text;
    readonly false: Text;
}

export interface Noul {
    readonly instructions: Text;
    readonly criteria: NoulCriteria;
}

export interface DecidedAnswers {
    readonly kind: 'decided';
    readonly answers: ReadonlyMap<Text, Probability>;
    readonly tokens: Count;
    readonly costUsd: Usd;
    readonly tookMs: Duration;
    readonly model: Text;
}

export type DecidedAnswersResult = DecidedAnswers | Unknown;

export interface DeciderPort {
    readonly label: Text;
    ask(state: Text, questions: ReadonlyMap<Text, Noul>): Promise<DecidedAnswersResult>;
}
