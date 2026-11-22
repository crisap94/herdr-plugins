import { EXCHANGES } from '#src/protocol/exchanges/index.ts';
import { failureStage, isFailureStage, type FailureStage } from '#src/protocol/exchange.ts';

const PLAIN_OUTCOMES = ['done', 'settled', 'off', 'interrupted'] as const;

const FAILURE_REASONS = EXCHANGES.flatMap((exchange) => exchange.failureReasons);

export type FailureReason = (typeof FAILURE_REASONS)[number];

interface PlainAskOutcome {
    readonly kind: (typeof PLAIN_OUTCOMES)[number];
}

interface FailedAskOutcome {
    readonly kind: 'failed';
    readonly reason: FailureReason;
}

export type AskOutcome = PlainAskOutcome | FailedAskOutcome;

export function parseAskOutcome(text: unknown): AskOutcome | null {
    if (typeof text !== 'string') {
        return null;
    }
    if (isFailureStage(text)) {
        const reason = FAILURE_REASONS.find((each) => failureStage(each) === text);
        return reason === undefined ? null : { kind: 'failed', reason };
    }
    const kind = PLAIN_OUTCOMES.find((each) => each === text);
    return kind === undefined ? null : { kind };
}

export const outcomeOf = parseAskOutcome;

export type OutcomeText = FailureStage | PlainAskOutcome['kind'];

export function outcomeText(outcome: AskOutcome): OutcomeText { return outcome.kind === 'failed' ? failureStage(outcome.reason) : outcome.kind; }
