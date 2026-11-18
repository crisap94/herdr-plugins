import { idGrammarOf } from '#src/protocol/codec.ts';
import { compact } from '#src/protocol/exchanges/compact.ts';
import { LIMITS, parseRequestId } from '#src/protocol/primitives.ts';
import type { RequestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import type { AskOutcome } from './ask-outcome.ts';

export const COMPACT_EXCHANGE = compact.name;
export const VALUE_MAX = LIMITS.valueMax;
export const ANSWER_TTL_MS = 3_600_000;
export const NOT_ACTED: AskOutcome = { kind: 'off' };

const ID_GRAMMAR = must(idGrammarOf(compact.request));

export type AskId = RequestId;

export function parseAskId(raw: unknown): AskId | null {
    const id = parseRequestId(raw, ID_GRAMMAR);
    return id.kind === 'ok' ? id.value : null;
}

export { finalAnswerOf, isTerminalStage, noteOf } from './legacy.ts';
