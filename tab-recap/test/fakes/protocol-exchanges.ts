import { buildRegistry } from '#src/protocol/registry.ts';
import { wireOf } from './wire-tokens.ts';
import type { Registry } from '#src/protocol/registry.ts';
import { defineExchange, parseRequest } from '#src/protocol/exchange.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import { CAPABILITY_TOKEN, capabilityValueTyped } from '#src/protocol/capability.ts';
import { answerWrite, takeRequests } from '#src/protocol/responder.ts';
import type { Taking } from '#src/protocol/responder.ts';
import type { TokenMap, TokenWrite } from '#src/protocol/tokens.ts';
import { parseAnswerStage, parseExchangeName, parseExchangeVersion, parseFieldName, parseFlagText, parseRequestPrefix, parseTimingMs, parseTimingName, parseTokenName, parseToolName, parseTokenValue, parseWireText, refuse } from '#src/protocol/primitives.ts';
import type { ExchangeName, ExchangeVersion, OptIn, Refusal, RequestId, TokenName, TokenValue, ToolName } from '#src/protocol/primitives.ts';
import type { Result } from '@stateforge-labs/session-ledger';
import type { ParsedValue } from '#src/protocol/codec.ts';

export function unwrap<T, E>(result: Result<T, E>): T {
    if (result.kind === 'err') {
        throw new Error(`refused: ${JSON.stringify(result.error)}`);
    }
    return result.value;
}

export type SeenCheck = (exchange: ExchangeName, tool: ToolName, id: RequestId) => boolean;

export function take(registry: Registry, tokens: TokenMap, seen: SeenCheck): Taking {
    return takeRequests(registry, wireOf(tokens), (exchange, tool, id) => (seen(exchange, tool, id) ? 'seen' : 'fresh'));
}

export function answer(exchange: Exchange, id: RequestId, stage: string): Result<TokenWrite, Refusal> {
    const text = parseWireText(stage);
    return text.kind === 'err' ? refuse(text.error, 'TokenValue') : answerWrite(exchange, id, text.value);
}

export function capabilityValue(exchanges: readonly Exchange[], kindsVersion: ExchangeVersion, isOn: (setting: OptIn) => boolean = () => true): Result<TokenValue, Refusal> {
    return capabilityValueTyped(exchanges, kindsVersion, (setting) => (isOn(setting) ? 'on' : 'off'));
}

export const nameOf = (raw: string): TokenName => unwrap(parseTokenName(raw));

export const toolOf = (raw: string): ToolName => unwrap(parseToolName(raw));

export const parsedOf = (exchange: Exchange, raw: string): ParsedValue => unwrap(parseRequest(exchange, unwrap(parseTokenValue(raw))));

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
