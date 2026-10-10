import { err, ok } from './result.ts';
import type { Result } from './result.ts';

export const LIMITS = {
    valueMax: 80,
    nameMax: 32,
    idMax: 16,
    ownNamesPerPane: 10,
    requestsPerCall: 16,
    toolMax: 20,
    exchangeMax: 16,
    versionMax: 99,
} as const;

export type Brand<Carrier, Name extends string> = Carrier & { readonly __brand: Name };

export type TokenName = Brand<string, 'TokenName'>;
export type TokenValue = Brand<string, 'TokenValue'>;
export type RequestId = Brand<string, 'RequestId'>;
export type ToolName = Brand<string, 'ToolName'>;
export type ExchangeName = Brand<string, 'ExchangeName'>;
export type ExchangeVersion = Brand<number, 'ExchangeVersion'>;

export type IdGrammar = 'legacy-length' | 'token-safe';

export type RefusalReason = 'empty' | 'too-long' | 'bad-characters' | 'bad-grammar';

export type Refusal = { readonly reason: RefusalReason; readonly subject: string };

export const WORD_SHAPE = /^[A-Za-z0-9_-]+$/;

const REQUEST_ID_SHAPE: Readonly<Record<IdGrammar, RegExp>> = {
    'legacy-length': /^[^:]+$/,
    'token-safe': WORD_SHAPE,
};

export const refuse = (reason: RefusalReason, subject: string): Result<never, Refusal> => err({ reason, subject });

export function checkedText<T extends string>(subject: string, raw: string, max: number, shape: RegExp): Result<T, Refusal> {
    if (raw === '') {
        return refuse('empty', subject);
    }
    if (raw.length > max) {
        return refuse('too-long', subject);
    }
    if (!shape.test(raw)) {
        return refuse('bad-characters', subject);
    }
    return ok(raw as T);
}

export const tokenName = (raw: string): Result<TokenName, Refusal> => checkedText<TokenName>('TokenName', raw, LIMITS.nameMax, WORD_SHAPE);

export const tokenValue = (raw: string): Result<TokenValue, Refusal> =>
    raw.length > LIMITS.valueMax ? refuse('too-long', 'TokenValue') : ok(raw as TokenValue);

export const requestId = (raw: string, grammar: IdGrammar): Result<RequestId, Refusal> =>
    checkedText<RequestId>('RequestId', raw, LIMITS.idMax, REQUEST_ID_SHAPE[grammar]);

export const toolName = (raw: string): Result<ToolName, Refusal> => checkedText<ToolName>('ToolName', raw, LIMITS.toolMax, WORD_SHAPE);

export const exchangeName = (raw: string): Result<ExchangeName, Refusal> =>
    checkedText<ExchangeName>('ExchangeName', raw, LIMITS.exchangeMax, /^[a-z][a-z0-9-]*$/);

export const exchangeVersion = (n: number): Result<ExchangeVersion, Refusal> =>
    Number.isInteger(n) && n >= 1 && n <= LIMITS.versionMax ? ok(n as ExchangeVersion) : refuse('bad-grammar', 'ExchangeVersion');
