import type { Result } from '@stateforge-labs/session-ledger/unstable/protocol/result.ts';
import { ANSWER_SEPARATOR, LIMITS, parseTokenValue } from './primitives.ts';
import type { AnswerFit, IdText, Refusal, TokenValue } from './primitives.ts';

export function answerValue(exchange: { readonly answerFit: AnswerFit }, id: IdText, stage: string): Result<TokenValue, Refusal> {
    const text = `${id}${ANSWER_SEPARATOR}${stage}`;
    return parseTokenValue(exchange.answerFit === 'truncate' ? text.slice(0, LIMITS.valueMax) : text);
}
