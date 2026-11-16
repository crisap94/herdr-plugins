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
export type FieldName = Brand<string, 'FieldName'>;
export type FlagText = Brand<string, 'FlagText'>;
export type CharLimit = Brand<number, 'CharLimit'>;
export type IdText = Brand<string, 'IdText'>;
export type WireText = Brand<string, 'WireText'>;
export type FieldText = Brand<string, 'FieldText'>;
export type FlagValue = true;
export type FieldValue = FieldText | FlagValue | null;
export type SegmentIndex = Brand<number, 'SegmentIndex'>;
export type RequestPrefix = Brand<string, 'RequestPrefix'>;
export type AnswerStage = Brand<string, 'AnswerStage'>;
export type EventName = Brand<string, 'EventName'>;
export type OptIn = Brand<string, 'OptIn'>;
export type TimingName = Brand<string, 'TimingName'>;
export type TimingMs = Brand<number, 'TimingMs'>;
export type RefusalDetail = Brand<string, 'RefusalDetail'>;
export type CharCount = Brand<number, 'CharCount'>;
export type AnswerFit = 'truncate' | 'whole';
export type Presence = 'optional' | 'required';

type Candidate = Brand<string, 'Candidate'>;

export type IdGrammar = 'legacy-length' | 'token-safe';

export type RefusalReason = 'empty' | 'too-long' | 'bad-characters' | 'bad-grammar';

export type RefusalSubject = FieldName | 'TokenName' | 'TokenValue' | 'RequestId' | 'ToolName' | 'ExchangeName' | ExchangeName | 'ExchangeVersion' | 'layout' | 'capability';

export type Refusal = { readonly reason: RefusalReason; readonly subject: RefusalSubject };

export const WORD_SHAPE = /^[A-Za-z0-9_-]+$/;

export const PANE_PART_SHAPE = /^(?!refresh$)[A-Za-z0-9]+$/;

export type WordShape = 'word' | 'pane-part';

export const WORD_SHAPES: Readonly<Record<WordShape, RegExp>> = { word: WORD_SHAPE, 'pane-part': PANE_PART_SHAPE };

const REQUEST_ID_SHAPE: Readonly<Record<IdGrammar, RegExp>> = {
    'legacy-length': /^[^:]+$/,
    'token-safe': WORD_SHAPE,
};

export const refuse = (reason: RefusalReason, subject: RefusalSubject): Result<never, Refusal> => err({ reason, subject });

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

export function parseFieldName(raw: unknown): Result<FieldName, RefusalReason> {
    const word = parseWord(raw, LIMITS.nameMax, WORD_SHAPE);
    return word.kind === 'ok' ? ok(brand<string, 'FieldName'>(word.value)) : word;
}

export function parseFlagText(raw: unknown): Result<FlagText, RefusalReason> {
    const word = parseWord(raw, LIMITS.nameMax, WORD_SHAPE);
    return word.kind === 'ok' ? ok(brand<string, 'FlagText'>(word.value)) : word;
}

export function parseCharLimit(raw: unknown): Result<CharLimit, RefusalReason> {
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= LIMITS.valueMax
        ? ok(brand<number, 'CharLimit'>(raw))
        : err<RefusalReason>('bad-grammar');
}

export function parseWireText(raw: unknown): Result<WireText, RefusalReason> {
    return typeof raw === 'string' ? ok(brand<string, 'WireText'>(raw)) : err<RefusalReason>('bad-grammar');
}

export function parseFieldText(raw: unknown): Result<FieldText, RefusalReason> {
    return typeof raw === 'string' ? ok(brand<string, 'FieldText'>(raw)) : err<RefusalReason>('bad-grammar');
}

export const parseFlagFieldText = (flag: FlagText): FieldText => brand<string, 'FieldText'>(flag);

export const parseRestText = (segments: readonly FieldText[]): FieldText => brand<string, 'FieldText'>(segments.join(':'));

export const parseSegmentStart = (): SegmentIndex => brand<number, 'SegmentIndex'>(0);

export const parseNextSegment = (at: SegmentIndex): SegmentIndex => brand<number, 'SegmentIndex'>(at + 1);

export const parseSegmentEnd = (segments: readonly FieldText[]): SegmentIndex => brand<number, 'SegmentIndex'>(segments.length);

export const parseRefusalDetail = (raw: unknown): RefusalDetail => brand<string, 'RefusalDetail'>(String(raw));

export const parseCharCount = (raw: unknown): CharCount => brand<number, 'CharCount'>(Number(raw));

export function parseIdText(raw: string): IdText {
    const cut = raw.indexOf(':');
    return brand<string, 'IdText'>(cut < 0 ? raw : raw.slice(0, cut));
}

export function parseRequestPrefix(raw: unknown): Result<RequestPrefix, RefusalReason> {
    const word = parseWord(raw, LIMITS.nameMax, WORD_SHAPE);
    return word.kind === 'ok' ? ok(brand<string, 'RequestPrefix'>(word.value)) : word;
}

export function parseAnswerStage(raw: unknown): Result<AnswerStage, RefusalReason> {
    const word = parseWord(raw, LIMITS.valueMax, WORD_SHAPE);
    return word.kind === 'ok' ? ok(brand<string, 'AnswerStage'>(word.value)) : word;
}

export function parseEventName(raw: unknown): Result<EventName, RefusalReason> {
    const word = parseWord(raw, LIMITS.nameMax, WORD_SHAPE);
    return word.kind === 'ok' ? ok(brand<string, 'EventName'>(word.value)) : word;
}

export function parseOptIn(raw: unknown): Result<OptIn, RefusalReason> {
    const word = parseWord(raw, LIMITS.nameMax, /^[A-Z][A-Z0-9_]*$/);
    return word.kind === 'ok' ? ok(brand<string, 'OptIn'>(word.value)) : word;
}

export function parseTimingName(raw: unknown): Result<TimingName, RefusalReason> {
    const word = parseWord(raw, LIMITS.nameMax, WORD_SHAPE);
    return word.kind === 'ok' ? ok(brand<string, 'TimingName'>(word.value)) : word;
}

export function parseTimingMs(raw: unknown): Result<TimingMs, RefusalReason> {
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? ok(brand<number, 'TimingMs'>(raw)) : err<RefusalReason>('bad-grammar');
}

export const requestId = parseRequestId;
