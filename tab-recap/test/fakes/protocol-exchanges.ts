import { buildRegistry } from '#src/protocol/registry.ts';
import type { Registry } from '#src/protocol/registry.ts';
import { defineExchange, parseRequest } from '#src/protocol/exchange.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import { CAPABILITY_TOKEN } from '#src/protocol/capability.ts';
import { exchangeName, exchangeVersion, tokenName, toolName } from '#src/protocol/primitives.ts';
import type { TokenName, ToolName } from '#src/protocol/primitives.ts';
import type { Result } from '#src/protocol/result.ts';
import type { ParsedValue } from '#src/protocol/codec.ts';

export function unwrap<T, E>(result: Result<T, E>): T {
    if (result.kind === 'err') {
        throw new Error(`refused: ${JSON.stringify(result.error)}`);
    }
    return result.value;
}

export const nameOf = (raw: string): TokenName => unwrap(tokenName(raw));

export const toolOf = (raw: string): ToolName => unwrap(toolName(raw));

export const parsedOf = (exchange: Exchange, raw: string): ParsedValue => unwrap(parseRequest(exchange, raw));

export const compactLike: Exchange = defineExchange({
    name: unwrap(exchangeName('compact')),
    version: unwrap(exchangeVersion(1)),
    requestPrefix: 'compact-req-',
    request: [
        { kind: 'id', grammar: 'legacy-length' },
        { kind: 'rest', name: 'note', optional: true, maxChars: null },
    ],
    answerStages: ['queued', 'running', 'done'],
    failureReasons: ['bad-id', 'interrupted', 'refused'],
    events: [],
    optIn: null,
    timing: {},
    truncatesAnswer: true,
});

export const handoffLike: Exchange = defineExchange({
    name: unwrap(exchangeName('handoff')),
    version: unwrap(exchangeVersion(1)),
    requestPrefix: 'handoff-req-',
    request: [
        { kind: 'id', grammar: 'token-safe' },
        { kind: 'word', name: 'target', optional: false },
        { kind: 'flag', name: 'urgent', text: 'urgent' },
    ],
    answerStages: ['queued', 'running', 'done'],
    failureReasons: ['bad-id', 'interrupted', 'refused'],
    events: [],
    optIn: null,
    timing: { 'deadline-ms': 60000 },
    truncatesAnswer: false,
});

export const registryOf = (exchanges: readonly Exchange[]): Registry => unwrap(buildRegistry(exchanges, [CAPABILITY_TOKEN]));
