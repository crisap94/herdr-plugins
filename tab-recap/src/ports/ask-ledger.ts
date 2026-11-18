import { err, ok } from '#src/protocol/result.ts';
import type { Result } from '#src/protocol/result.ts';
import { parseExchangeName, parseRequestId, parseToolName } from '#src/protocol/primitives.ts';
import type { ExchangeName, RequestId, Refusal, ToolName } from '#src/protocol/primitives.ts';
import { outcomeOf } from '#src/recap/domain/ask-outcome.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import { parsePaneId } from '#src/recap/domain/ids.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export const LOCAL_REQUESTER = 'cli';

export type Requester = ToolName | typeof LOCAL_REQUESTER;

export type { Ask, AskLedger, NewAsk } from './legacy.ts';

export interface AskEntry {
    readonly exchange: ExchangeName;
    readonly requester: Requester;
    readonly id: RequestId;
    readonly pane: PaneId;
    readonly at: Instant;
    readonly ref: Text | null;
    readonly outcome: AskOutcome | null;
}

export interface AskDraft {
    readonly exchange: ExchangeName;
    readonly requester: Requester;
    readonly id: RequestId;
    readonly pane: PaneId;
    readonly at: Instant;
    readonly ref: Text | null;
}

export interface AskKey {
    readonly exchange: ExchangeName;
    readonly id: RequestId;
    readonly pane: PaneId;
}

export interface AskIdentity {
    readonly exchange: ExchangeName;
    readonly requester: Requester;
    readonly id: RequestId;
}

export type AskSighting = 'seen' | 'unseen';

export interface AskBook {
    seen(exchange: ExchangeName, requester: Requester, id: RequestId): AskSighting;
    record(ask: AskDraft): void;
    attach(match: AskKey, ref: Text): void;
    withdraw(identity: AskIdentity): void;
    settle(match: AskKey, outcome: AskOutcome): void;
    unfinished(): readonly AskEntry[];
    prune(before: Instant): void;
}

interface Row {
    readonly [key: string]: unknown;
}

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

const FAILURES: Record<Refusal['reason'], ParseFailure> = {
    empty: { kind: 'empty' },
    'too-long': { kind: 'out-of-range' },
    'bad-characters': { kind: 'not-a-string' },
    'bad-grammar': { kind: 'not-a-string' },
};

function lift<T>(result: Result<T, Refusal>): Result<T, ParseFailure> {
    return result.kind === 'ok' ? ok(result.value) : err(FAILURES[result.error.reason]);
}

export function parseRequester(input: unknown): Result<Requester, ParseFailure> {
    if (input === LOCAL_REQUESTER) {
        return ok(LOCAL_REQUESTER);
    }
    return lift(parseToolName(input));
}

type AskNotes = Pick<AskEntry, 'ref' | 'outcome'>;

function notesOf(row: Row): Result<AskNotes, ParseFailure> {
    const ref = row.ref === null ? ok(null) : parseText(row.ref);
    if (ref.kind === 'err') return ref;
    const text = row.outcome === null ? ok(null) : parseText(row.outcome);
    if (text.kind === 'err') return text;
    const outcome = text.value === null ? null : outcomeOf(text.value);
    if (text.value !== null && outcome === null) return err({ kind: 'out-of-range' });
    return ok({ ref: ref.value, outcome });
}

export function parseAskEntry(input: unknown): Result<AskEntry, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const exchange = lift(parseExchangeName(input.exchange));
    if (exchange.kind === 'err') return exchange;
    const requester = parseRequester(input.requester);
    if (requester.kind === 'err') return requester;
    const id = lift(parseRequestId(input.id, 'legacy-length'));
    if (id.kind === 'err') return id;
    const pane = parsePaneId(input.pane);
    if (pane.kind === 'err') return pane;
    const at = parseInstant(input.at);
    if (at.kind === 'err') return at;
    const notes = notesOf(input);
    if (notes.kind === 'err') return notes;
    return ok({ exchange: exchange.value, requester: requester.value, id: id.value, pane: pane.value, at: at.value, ...notes.value });
}
