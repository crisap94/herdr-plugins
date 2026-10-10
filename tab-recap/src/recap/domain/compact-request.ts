import { idGrammarOf, idTextOf } from '#src/protocol/codec.ts';
import type { ParsedValue } from '#src/protocol/codec.ts';
import { compact, COMPACT_FAILURES, COMPACT_STAGES } from '#src/protocol/exchanges/compact.ts';
import type { CompactFailure } from '#src/protocol/exchanges/compact.ts';
import { answerValue as answerValueOf, badIdValue, failureStage, isFailureStage, parseRequest } from '#src/protocol/exchange.ts';
import { LIMITS, requestId } from '#src/protocol/primitives.ts';
import type { RequestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import type { AskOutcome } from './ask-outcome.ts';

export const REQUEST_PREFIX = compact.requestPrefix;
export const COMPACT_EXCHANGE = compact.name;
export const VALUE_MAX = LIMITS.valueMax;
export const ANSWER_TTL_MS = 3_600_000;
export const NOT_ACTED: AskOutcome = { kind: 'off' };

const ID_GRAMMAR = must(idGrammarOf(compact.request));

export interface Asked {
    readonly id: string;
    readonly note: string | null;
    readonly valid: boolean;
}

const fitNote = (id: string, note: string): string | null => (note.trim() === '' ? null : note.slice(0, VALUE_MAX - id.length - 1));

export const parseAskId = (raw: string): RequestId | null => {
    const id = requestId(raw, ID_GRAMMAR);
    return id.kind === 'ok' ? id.value : null;
};

export const noteOf = (value: ParsedValue): string | null => {
    const note = value['note'];
    return typeof note === 'string' ? fitNote(value.id, note) : null;
};

export function askedOf(value: string): Asked | null {
    if (value === '') {
        return null;
    }
    const id = idTextOf(value);
    return { id, note: fitNote(id, value.slice(id.length + 1)), valid: parseRequest(compact, value).kind === 'ok' };
}

export const badIdAnswer = (id: string): string => badIdValue(id);

const slug = (word: string): string => word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';

export const endAnswerOf = (stage: string, why: string | null): string => (stage === 'compacted' ? COMPACT_STAGES.done : failureStage(slug(why ?? stage)));

export const refusalAnswerOf = (why: string): string => failureStage(slug(why));

export const finalAnswerOf = (stage: string, reason: CompactFailure | null): string =>
    stage === 'compacted' ? COMPACT_STAGES.done : failureStage(reason ?? (stage === 'skipped' ? COMPACT_FAILURES.skipped : COMPACT_FAILURES.error));

export const answerValue = (id: string, stage: string): string => must(answerValueOf(compact, id, stage));

export const isTerminalStage = (stage: string): boolean => stage === COMPACT_STAGES.done || isFailureStage(stage);
