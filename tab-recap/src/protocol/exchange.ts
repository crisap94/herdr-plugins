import { must } from './result.ts';
import type { Result } from './result.ts';
import { LIMITS, parseTokenName, parseTokenValue } from './primitives.ts';
import type { AnswerFit, AnswerStage, EventName, ExchangeName, ExchangeVersion, IdText, OptIn, Refusal, RequestPrefix, TimingMs, TimingName, TokenName, TokenValue, ToolName, WireText } from './primitives.ts';
import { parseValue, serializeValue } from './codec.ts';
import type { FieldSpec, ParsedValue } from './codec.ts';
import type { ReasonWord } from './reasons.ts';

export { INTERRUPTED_REASON } from './reasons.ts';

export type Timing = Readonly<Record<TimingName, TimingMs>>;

export type Exchange = {
    readonly name: ExchangeName;
    readonly version: ExchangeVersion;
    readonly requestPrefix: RequestPrefix;
    readonly request: readonly FieldSpec[];
    readonly answerStages: readonly AnswerStage[];
    readonly failureReasons: readonly ReasonWord[];
    readonly refusalReasons?: readonly ReasonWord[];
    readonly unsupportedReasons?: readonly ReasonWord[];
    readonly events: readonly EventName[];
    readonly optIn: OptIn | null;
    readonly timing: Timing;
    readonly answerFit: AnswerFit;
};

export const ANSWER_PREFIX = 'tab-recap-';

export const FAILURE_PREFIX = 'failed-';

export const REFUSED_PREFIX = 'refused-';

export const UNSUPPORTED_PREFIX = 'unsupported-';

export const defineExchange = (exchange: Exchange): Exchange => exchange;

export type FailureStage = `${typeof FAILURE_PREFIX}${ReasonWord}`;

export const failureStage = (reason: ReasonWord): FailureStage => `${FAILURE_PREFIX}${reason}`;

export const isFailureStage = (stage: string): stage is FailureStage => stage.startsWith(FAILURE_PREFIX);

export type TerminalKind = 'failed' | 'refused' | 'unsupported';

export type Terminal = { readonly kind: TerminalKind; readonly reason: ReasonWord };

export type TerminalStage = `${typeof FAILURE_PREFIX | typeof REFUSED_PREFIX | typeof UNSUPPORTED_PREFIX}${ReasonWord}`;

const TERMINAL_PREFIX = {
    failed: FAILURE_PREFIX,
    refused: REFUSED_PREFIX,
    unsupported: UNSUPPORTED_PREFIX,
} as const satisfies Readonly<Record<TerminalKind, string>>;

export const terminalStage = (terminal: Terminal): TerminalStage => `${TERMINAL_PREFIX[terminal.kind]}${terminal.reason}`;

export const terminalsOf = (exchange: Exchange): readonly Terminal[] => [
    ...exchange.failureReasons.map((reason): Terminal => ({ kind: 'failed', reason })),
    ...(exchange.refusalReasons ?? []).map((reason): Terminal => ({ kind: 'refused', reason })),
    ...(exchange.unsupportedReasons ?? []).map((reason): Terminal => ({ kind: 'unsupported', reason })),
];

export const answerToken = (exchange: Exchange): Result<TokenName, Refusal> => parseTokenName(`${ANSWER_PREFIX}${exchange.name}`);

export const requestName = (exchange: Exchange, tool: ToolName): Result<TokenName, Refusal> => parseTokenName(`${exchange.requestPrefix}${tool}`);

const ANSWER_SEPARATOR = ':';

const answerText = (id: IdText, stage: string, fit: AnswerFit): Result<TokenValue, Refusal> => {
    const text = `${id}${ANSWER_SEPARATOR}${stage}`;
    return parseTokenValue(fit === 'truncate' ? text.slice(0, LIMITS.valueMax) : text);
};

export function answerValue(exchange: Exchange, id: IdText, stage: string): Result<TokenValue, Refusal> {
    return answerText(id, stage, exchange.answerFit);
}

export const badIdValue = (rawId: IdText): TokenValue => must(parseTokenValue(`${rawId.slice(0, LIMITS.idMax)}${ANSWER_SEPARATOR}${failureStage('bad-id')}`));

export interface AnswerSplit {
    readonly id: string;
    readonly stage: string;
}

export const splitAnswer = (raw: string): AnswerSplit | null => {
    const cut = raw.indexOf(ANSWER_SEPARATOR);
    return cut < 0 ? null : { id: raw.slice(0, cut), stage: raw.slice(cut + ANSWER_SEPARATOR.length) };
};

export const parseRequest = (exchange: Exchange, raw: WireText): Result<ParsedValue, Refusal> => parseValue(exchange.request, raw);

export const serializeRequest = (exchange: Exchange, value: ParsedValue): Result<TokenValue, Refusal> =>
    serializeValue(exchange.request, value);
