import { FAILURE_PREFIX, failureStage, isFailureStage } from '#src/protocol/exchange.ts';

const PLAIN_OUTCOMES = ['done', 'settled', 'off', 'interrupted'] as const;

export type AskOutcome = { readonly kind: (typeof PLAIN_OUTCOMES)[number] } | { readonly kind: 'failed'; readonly reason: string };

export const outcomeText = (outcome: AskOutcome): string => (outcome.kind === 'failed' ? failureStage(outcome.reason) : outcome.kind);

export function outcomeOf(text: string): AskOutcome | null {
    if (isFailureStage(text)) {
        return { kind: 'failed', reason: text.slice(FAILURE_PREFIX.length) };
    }
    const kind = PLAIN_OUTCOMES.find((each) => each === text);
    return kind === undefined ? null : { kind };
}
