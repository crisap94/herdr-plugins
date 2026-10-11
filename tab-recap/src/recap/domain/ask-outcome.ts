import { EXCHANGES } from '#src/protocol/exchanges/index.ts';
import { failureStage, isFailureStage } from '#src/protocol/exchange.ts';

const PLAIN_OUTCOMES = ['done', 'settled', 'off', 'interrupted'] as const;

const FAILURE_REASONS = EXCHANGES.flatMap((exchange) => exchange.failureReasons);

export type FailureReason = (typeof FAILURE_REASONS)[number];

export type AskOutcome = { readonly kind: (typeof PLAIN_OUTCOMES)[number] } | { readonly kind: 'failed'; readonly reason: FailureReason };

export const outcomeText = (outcome: AskOutcome): string => (outcome.kind === 'failed' ? failureStage(outcome.reason) : outcome.kind);

export function outcomeOf(text: string): AskOutcome | null {
    if (isFailureStage(text)) {
        const reason = FAILURE_REASONS.find((each) => failureStage(each) === text);
        return reason === undefined ? null : { kind: 'failed', reason };
    }
    const kind = PLAIN_OUTCOMES.find((each) => each === text);
    return kind === undefined ? null : { kind };
}
