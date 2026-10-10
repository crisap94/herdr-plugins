import { idGrammarOf } from '#src/protocol/codec.ts';
import type { ParsedValue } from '#src/protocol/codec.ts';
import { compact, COMPACT_FAILURES, COMPACT_STAGES } from '#src/protocol/exchanges/compact.ts';
import type { CompactFailure } from '#src/protocol/exchanges/compact.ts';
import { isFailureStage, failureStage } from '#src/protocol/exchange.ts';
import { LIMITS, requestId } from '#src/protocol/primitives.ts';
import type { RequestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import type { AskOutcome } from './ask-outcome.ts';

export const COMPACT_EXCHANGE = compact.name;
export const VALUE_MAX = LIMITS.valueMax;
export const ANSWER_TTL_MS = 3_600_000;
export const NOT_ACTED: AskOutcome = { kind: 'off' };

const ID_GRAMMAR = must(idGrammarOf(compact.request));

const fitNote = (id: string, note: string): string | null => (note.trim() === '' ? null : note.slice(0, VALUE_MAX - id.length - 1));

export const parseAskId = (raw: string): RequestId | null => {
    const id = requestId(raw, ID_GRAMMAR);
    return id.kind === 'ok' ? id.value : null;
};

export const noteOf = (value: ParsedValue): string | null => {
    const note = value['note'];
    return typeof note === 'string' ? fitNote(value.id, note) : null;
};

export const finalAnswerOf = (stage: string, reason: CompactFailure | null): string =>
    stage === 'compacted' ? COMPACT_STAGES.done : failureStage(reason ?? (stage === 'skipped' ? COMPACT_FAILURES.skipped : COMPACT_FAILURES.error));

export const isTerminalStage = (stage: string): boolean => stage === COMPACT_STAGES.done || isFailureStage(stage);
