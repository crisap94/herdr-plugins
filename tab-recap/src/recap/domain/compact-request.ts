import { idGrammarOf } from '#src/protocol/codec.ts';
import { COMPACT_FAILURES, COMPACT_STAGES, compact, type CompactFailure } from '#src/protocol/exchanges/compact.ts';
import { failureStage, type FailureStage } from '#src/protocol/exchange.ts';
import type { ParsedValue } from '#src/protocol/codec.ts';
import { LIMITS, parseRequestId } from '#src/protocol/primitives.ts';
import type { RequestId } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { AskOutcome } from './ask-outcome.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

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

const NOTE_MAX = VALUE_MAX;

export type EndedStage = 'compacted' | 'failed' | 'unconfirmed' | 'skipped';

export type FinalAnswer = typeof COMPACT_STAGES.done | FailureStage;

export function finalAnswerOf(stage: EndedStage, reason: CompactFailure | null): FinalAnswer {
    return stage === 'compacted' ? COMPACT_STAGES.done : failureStage(reason ?? (stage === 'skipped' ? COMPACT_FAILURES.skipped : COMPACT_FAILURES.error));
}

export function noteOf(value: ParsedValue): Text | null {
    const note = value['note'];
    return typeof note === 'string' && note.trim() !== '' ? textOf(note.slice(0, NOTE_MAX - value.id.length - 1)) : null;
}
