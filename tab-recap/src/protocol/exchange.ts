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

export function answerValue(exchange: Exchange, id: RequestId, stage: string): Result<TokenValue, Refusal> {
    const text = `${id}:${stage}`;
    return tokenValue(exchange.truncatesAnswer ? text.slice(0, LIMITS.valueMax) : text);
}

export const parseRequest = (exchange: Exchange, raw: string): Result<ParsedValue, Refusal> => parseValue(exchange.request, raw);

export const serializeRequest = (exchange: Exchange, value: ParsedValue): Result<TokenValue, Refusal> =>
    serializeValue(exchange.request, value);
