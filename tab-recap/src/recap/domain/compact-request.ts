import { idGrammarOf, idTextOf } from '#src/protocol/codec.ts';
import { compact } from '#src/protocol/exchanges/compact.ts';
import { answerValue as answerValueOf, badIdValue, failureStage } from '#src/protocol/exchange.ts';
import { LIMITS, requestId } from '#src/protocol/primitives.ts';
import type { RequestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';

export const REQUEST_PREFIX = compact.requestPrefix;
export const VALUE_MAX = LIMITS.valueMax;
export const ANSWER_TTL_MS = 3_600_000;

const ID_GRAMMAR = must(idGrammarOf(compact.request));

export interface Asked {
    readonly id: string;
    readonly note: string | null;
    readonly valid: boolean;
}

export function askedOf(value: string): Asked | null {
    if (value === '') {
        return null;
    }
    const id = idTextOf(value);
    const note = value.slice(id.length + 1);
    return { id, note: note.trim() === '' ? null : note.slice(0, VALUE_MAX - id.length - 1), valid: requestId(id, ID_GRAMMAR).kind === 'ok' };
}

export const badIdAnswer = (id: string): string => badIdValue(id);

const slug = (word: string): string => word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';

export const endAnswerOf = (stage: string, why: string | null): string => (stage === 'compacted' ? 'done' : failureStage(slug(why ?? stage)));

export const refusalAnswerOf = (why: string): string => failureStage(slug(why));

export const answerValue = (id: string, stage: string): string => must(answerValueOf(compact, id as RequestId, stage));
