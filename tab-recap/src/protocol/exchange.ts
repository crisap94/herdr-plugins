import type { Result } from './result.ts';
import { LIMITS, tokenName, tokenValue } from './primitives.ts';
import type { ExchangeName, ExchangeVersion, Refusal, RequestId, TokenName, TokenValue, ToolName } from './primitives.ts';
import { parseValue, serializeValue } from './codec.ts';
import type { FieldSpec, ParsedValue } from './codec.ts';

export type Exchange = {
    readonly name: ExchangeName;
    readonly version: ExchangeVersion;
    readonly requestPrefix: string;
    readonly request: readonly FieldSpec[];
    readonly answerStages: readonly string[];
    readonly failureReasons: readonly string[];
    readonly events: readonly string[];
    readonly optIn: string | null;
    readonly timing: Readonly<Record<string, number>>;
    readonly truncatesAnswer: boolean;
};

export const ANSWER_PREFIX = 'tab-recap-';

export const defineExchange = (exchange: Exchange): Exchange => exchange;

export const failureStage = (reason: string): string => `failed-${reason}`;

export const answerToken = (exchange: Exchange): Result<TokenName, Refusal> => tokenName(`${ANSWER_PREFIX}${exchange.name}`);

export const requestName = (exchange: Exchange, tool: ToolName): Result<TokenName, Refusal> => tokenName(`${exchange.requestPrefix}${tool}`);

const ANSWER_SEPARATOR = ':';

const answerText = (id: string, stage: string): string => `${id}${ANSWER_SEPARATOR}${stage}`;

export function answerValue(exchange: Exchange, id: RequestId, stage: string): Result<TokenValue, Refusal> {
    const text = answerText(id, stage);
    return tokenValue(exchange.truncatesAnswer ? text.slice(0, LIMITS.valueMax) : text);
}

export const badIdValue = (rawId: string): TokenValue => answerText(rawId.slice(0, LIMITS.idMax), failureStage('bad-id')) as TokenValue;

export const splitAnswer = (raw: string): { readonly id: string; readonly stage: string } | null => {
    const cut = raw.indexOf(ANSWER_SEPARATOR);
    return cut < 0 ? null : { id: raw.slice(0, cut), stage: raw.slice(cut + ANSWER_SEPARATOR.length) };
};

export const parseRequest = (exchange: Exchange, raw: string): Result<ParsedValue, Refusal> => parseValue(exchange.request, raw);

export const serializeRequest = (exchange: Exchange, value: ParsedValue): Result<TokenValue, Refusal> =>
    serializeValue(exchange.request, value);
