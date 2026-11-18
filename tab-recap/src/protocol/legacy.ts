import type { Result } from '@stateforge-labs/session-ledger/unstable/protocol/result.ts';
import { ANSWER_SEPARATOR, LIMITS, parseTokenValue, parseWireText, refuse } from './primitives.ts';
import type { ExchangeName, ExchangeVersion, IdText, OptIn, Refusal, RequestId, TokenValue, ToolName, WireText } from './primitives.ts';
import type { Exchange } from './exchange.ts';
import { capabilityValueTyped } from './capability.ts';
import { answerWrite, takeRequests } from './responder.ts';
import type { Taking } from './responder.ts';
import type { Registry } from './registry.ts';
import type { TokenMap, TokenWrite } from './tokens.ts';

export type SeenCheck = (exchange: ExchangeName, tool: ToolName, id: RequestId) => boolean;

export function answerValue(exchange: Exchange, id: IdText, stage: string): Result<TokenValue, Refusal> {
    const text = `${id}${ANSWER_SEPARATOR}${stage}`;
    return parseTokenValue(exchange.answerFit === 'truncate' ? text.slice(0, LIMITS.valueMax) : text);
}

export function capabilityValue(exchanges: readonly Exchange[], kindsVersion: ExchangeVersion, isOn: (setting: OptIn) => boolean = () => true): Result<TokenValue, Refusal> {
    return capabilityValueTyped(exchanges, kindsVersion, (setting) => (isOn(setting) ? 'on' : 'off'));
}

export function take(registry: Registry, tokens: TokenMap, seen: SeenCheck): Taking {
    const wire = new Map<WireText, WireText>();
    for (const [name, raw] of Object.entries(tokens)) {
        const key = parseWireText(name);
        const value = parseWireText(raw);
        if (key.kind === 'ok' && value.kind === 'ok') {
            wire.set(key.value, value.value);
        }
    }
    return takeRequests(registry, wire, (exchange, tool, id) => (seen(exchange, tool, id) ? 'seen' : 'fresh'));
}

export function answer(exchange: Exchange, id: RequestId, stage: string): Result<TokenWrite, Refusal> {
    const text = parseWireText(stage);
    return text.kind === 'err' ? refuse(text.error, 'TokenValue') : answerWrite(exchange, id, text.value);
}
