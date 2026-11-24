import type { Probability } from '#src/recap/domain/probability.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { TokenAmount } from '#src/recap/domain/token-amount.ts';
import type { Duration } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { Unknown } from '#src/ports/unknowable.ts';


export interface QuestionCriteria {
    readonly true: Text;
    readonly false: Text;
}

export interface Question {
    readonly instructions: Text;
    readonly criteria: QuestionCriteria;
}

export interface DecidedAnswers {
    readonly kind: 'decided';
    readonly answers: ReadonlyMap<Text, Probability>;
    readonly tokens: TokenAmount;
    readonly costUsd: Usd;
    readonly tookMs: Duration;
    readonly model: Text;
}

export type DecidedAnswersResult = DecidedAnswers | Unknown;

export interface DeciderPort {
    readonly label: Text;
    ask(state: Text, questions: ReadonlyMap<Text, Question>): Promise<DecidedAnswersResult>;
}
