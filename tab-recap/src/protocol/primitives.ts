import { err, ok } from './result.ts';
import type { Result } from './result.ts';
import { brand } from '../recap/domain/brand.ts';
import type { Brand } from '../recap/domain/brand.ts';

export const LIMITS = {
    valueMax: 80,
    nameMax: 32,
    idMax: 16,
    ownNamesPerPane: 10,
    toolMax: 20,
    exchangeMax: 16,
    versionMax: 99,
} as const;

type Limit = (typeof LIMITS)[keyof typeof LIMITS];

export type TokenName = Brand<string, 'TokenName'>;
export type TokenValue = Brand<string, 'TokenValue'>;
export type Word = Brand<string, 'Word'>;
export type RequestId = Brand<string, 'RequestId'>;
export type ToolName = Brand<string, 'ToolName'>;
export type ExchangeName = Brand<string, 'ExchangeName'>;
export type ExchangeVersion = Brand<number, 'ExchangeVersion'>;

type Candidate = Brand<string, 'Candidate'>;

export type IdGrammar = 'legacy-length' | 'token-safe';

export type RefusalReason = 'empty' | 'too-long' | 'bad-characters' | 'bad-grammar';

export type Refusal = { readonly reason: RefusalReason; readonly subject: string };

export const WORD_SHAPE = /^[A-Za-z0-9_-]+$/;

export const PANE_PART_SHAPE = /^(?!refresh$)[A-Za-z0-9]+$/;

export type WordShape = 'word' | 'pane-part';

export const WORD_SHAPES: Readonly<Record<WordShape, RegExp>> = { word: WORD_SHAPE, 'pane-part': PANE_PART_SHAPE };

const REQUEST_ID_SHAPE: Readonly<Record<IdGrammar, RegExp>> = {
    'legacy-length': /^[^:]+$/,
    'token-safe': WORD_SHAPE,
};

export const refuse = (reason: RefusalReason, subject: string): Result<never, Refusal> => err({ reason, subject });

function checkedText(raw: Candidate, max: Limit, shape: RegExp): Result<Candidate, RefusalReason> {
    if (raw === '') {
        return err<RefusalReason>('empty');
    }
    if (raw.length > max) {
        return err<RefusalReason>('too-long');
    }
    if (!shape.test(raw)) {
        return err<RefusalReason>('bad-characters');
    }
    return ok(raw);
}

export function parseWord(raw: unknown, max: Limit, shape: RegExp): Result<Word, RefusalReason> {
    if (typeof raw !== 'string') {
        return err<RefusalReason>('bad-grammar');
    }
    const text = checkedText(brand<string, 'Candidate'>(raw), max, shape);
    return text.kind === 'ok' ? ok(brand<string, 'Word'>(text.value)) : text;
}

export function parseTokenName(raw: unknown): Result<TokenName, Refusal> {
    const word = parseWord(raw, LIMITS.nameMax, WORD_SHAPE);
    return word.kind === 'ok' ? ok(brand<string, 'TokenName'>(word.value)) : refuse(word.error, 'TokenName');
}

export function parseTokenValue(raw: unknown): Result<TokenValue, Refusal> {
    if (typeof raw !== 'string') {
        return refuse('bad-grammar', 'TokenValue');
    }
    return raw.length > LIMITS.valueMax ? refuse('too-long', 'TokenValue') : ok(brand<string, 'TokenValue'>(raw));
}

export function parseRequestId(raw: unknown, grammar: IdGrammar): Result<RequestId, Refusal> {
    const word = parseWord(raw, LIMITS.idMax, REQUEST_ID_SHAPE[grammar]);
    return word.kind === 'ok' ? ok(brand<string, 'RequestId'>(word.value)) : refuse(word.error, 'RequestId');
}

export function parseToolName(raw: unknown): Result<ToolName, Refusal> {
    const word = parseWord(raw, LIMITS.toolMax, WORD_SHAPE);
    return word.kind === 'ok' ? ok(brand<string, 'ToolName'>(word.value)) : refuse(word.error, 'ToolName');
}

export function parseExchangeName(raw: unknown): Result<ExchangeName, Refusal> {
    const word = parseWord(raw, LIMITS.exchangeMax, /^[a-z][a-z0-9-]*$/);
    return word.kind === 'ok' ? ok(brand<string, 'ExchangeName'>(word.value)) : refuse(word.error, 'ExchangeName');
}

export function parseExchangeVersion(raw: unknown): Result<ExchangeVersion, Refusal> {
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= LIMITS.versionMax
        ? ok(brand<number, 'ExchangeVersion'>(raw))
        : refuse('bad-grammar', 'ExchangeVersion');
}

export const requestId = parseRequestId;
