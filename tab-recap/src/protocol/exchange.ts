import type { Result } from './result.ts';
import { LIMITS, tokenName, tokenValue } from './primitives.ts';
import type { ExchangeName, ExchangeVersion, Refusal, TokenName, TokenValue, ToolName } from './primitives.ts';
import { parseValue, serializeValue } from './codec.ts';
import type { FieldSpec, ParsedValue } from './codec.ts';

export type Exchange = {
    readonly name: ExchangeName;
    readonly version: ExchangeVersion;
    readonly requestPrefix: string;
    readonly request: readonly FieldSpec[];
    readonly answerStages: readonly string[];
    readonly failureReasons: readonly string[];
    readonly refusalReasons?: readonly string[];
    readonly unsupportedReasons?: readonly string[];
    readonly events: readonly string[];
    readonly optIn: string | null;
    readonly timing: Readonly<Record<string, number>>;
    readonly truncatesAnswer: boolean;
};

export const ANSWER_PREFIX = 'tab-recap-';

export const FAILURE_PREFIX = 'failed-';

export const REFUSED_PREFIX = 'refused-';

export const UNSUPPORTED_PREFIX = 'unsupported-';

export const INTERRUPTED_REASON = 'interrupted';

export const defineExchange = (exchange: Exchange): Exchange => exchange;

export const failureStage = (reason: string): string => `${FAILURE_PREFIX}${reason}`;

export const isFailureStage = (stage: string): boolean => stage.startsWith(FAILURE_PREFIX);

export type TerminalKind = 'failed' | 'refused' | 'unsupported';

export type Terminal = { readonly kind: TerminalKind; readonly reason: string };

const TERMINAL_PREFIX: Readonly<Record<TerminalKind, string>> = {
    failed: FAILURE_PREFIX,
    refused: REFUSED_PREFIX,
    unsupported: UNSUPPORTED_PREFIX,
};

export const terminalStage = (terminal: Terminal): string => `${TERMINAL_PREFIX[terminal.kind]}${terminal.reason}`;

export const terminalsOf = (exchange: Exchange): readonly Terminal[] => [
    ...exchange.failureReasons.map((reason): Terminal => ({ kind: 'failed', reason })),
    ...(exchange.refusalReasons ?? []).map((reason): Terminal => ({ kind: 'refused', reason })),
    ...(exchange.unsupportedReasons ?? []).map((reason): Terminal => ({ kind: 'unsupported', reason })),
];

export const answerToken = (exchange: Exchange): Result<TokenName, Refusal> => tokenName(`${ANSWER_PREFIX}${exchange.name}`);

export const requestName = (exchange: Exchange, tool: ToolName): Result<TokenName, Refusal> => tokenName(`${exchange.requestPrefix}${tool}`);

const ANSWER_SEPARATOR = ':';

const answerText = (id: string, stage: string): string => `${id}${ANSWER_SEPARATOR}${stage}`;

export function answerValue(exchange: Exchange, id: string, stage: string): Result<TokenValue, Refusal> {
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
