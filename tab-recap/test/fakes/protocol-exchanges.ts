import { buildRegistry } from '#src/protocol/registry.ts';
import type { Registry } from '#src/protocol/registry.ts';
import { defineExchange, parseRequest } from '#src/protocol/exchange.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import { CAPABILITY_TOKEN } from '#src/protocol/capability.ts';
import { parseAnswerStage, parseExchangeName, parseExchangeVersion, parseFieldName, parseFlagText, parseRequestPrefix, parseTimingMs, parseTimingName, parseTokenName, parseToolName, parseWireText } from '#src/protocol/primitives.ts';
import type { TokenName, ToolName } from '#src/protocol/primitives.ts';
import type { Result } from '#src/protocol/result.ts';
import type { ParsedValue } from '#src/protocol/codec.ts';

export function unwrap<T, E>(result: Result<T, E>): T {
    if (result.kind === 'err') {
        throw new Error(`refused: ${JSON.stringify(result.error)}`);
    }
    return result.value;
}

export const nameOf = (raw: string): TokenName => unwrap(parseTokenName(raw));

export const toolOf = (raw: string): ToolName => unwrap(parseToolName(raw));

export const parsedOf = (exchange: Exchange, raw: string): ParsedValue => unwrap(parseRequest(exchange, unwrap(parseWireText(raw))));

export const compactLike: Exchange = defineExchange({
    name: unwrap(parseExchangeName('compact')),
    version: unwrap(parseExchangeVersion(1)),
    requestPrefix: unwrap(parseRequestPrefix('compact-req-')),
    request: [
        { kind: 'id', grammar: 'legacy-length' },
        { kind: 'rest', name: unwrap(parseFieldName('note')), presence: 'optional', maxChars: null },
    ],
    answerStages: ['queued', 'running', 'done'].map((stage) => unwrap(parseAnswerStage(stage))),
    failureReasons: ['bad-id', 'interrupted', 'error'],
    events: [],
    optIn: null,
    timing: {},
    answerFit: 'truncate',
});

export const handoffLike: Exchange = defineExchange({
    name: unwrap(parseExchangeName('handoff')),
    version: unwrap(parseExchangeVersion(1)),
    requestPrefix: unwrap(parseRequestPrefix('handoff-req-')),
    request: [
        { kind: 'id', grammar: 'token-safe' },
        { kind: 'word', name: unwrap(parseFieldName('target')), presence: 'required' },
        { kind: 'flag', name: unwrap(parseFieldName('urgent')), text: unwrap(parseFlagText('urgent')) },
    ],
    answerStages: ['queued', 'running', 'done'].map((stage) => unwrap(parseAnswerStage(stage))),
    failureReasons: ['bad-id', 'interrupted', 'error'],
    events: [],
    optIn: null,
    timing: { [unwrap(parseTimingName('deadline-ms'))]: unwrap(parseTimingMs(60000)) },
    answerFit: 'whole',
});

export const registryOf = (exchanges: readonly Exchange[]): Registry => unwrap(buildRegistry(exchanges, [CAPABILITY_TOKEN]));
