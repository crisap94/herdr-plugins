import { ok } from './result.ts';
import type { Result } from './result.ts';
import { requestId, toolName } from './primitives.ts';
import type { ExchangeName, Refusal, RequestId, TokenValue, ToolName } from './primitives.ts';
import { answerToken, answerValue, badIdValue, parseRequest } from './exchange.ts';
import type { Exchange } from './exchange.ts';
import { idGrammarOf, idTextOf } from './codec.ts';
import type { ParsedValue } from './codec.ts';
import type { Registry } from './registry.ts';
import type { TokenMap, TokenWrite } from './tokens.ts';

export type SeenCheck = (exchange: ExchangeName, tool: ToolName, id: RequestId) => boolean;

export type Taken = { readonly exchange: Exchange; readonly tool: ToolName; readonly id: RequestId; readonly value: ParsedValue };

export type Refused = { readonly exchange: Exchange; readonly tool: ToolName; readonly rawId: string; readonly answer: TokenValue };

export type Taking = { readonly taken: readonly Taken[]; readonly refused: readonly Refused[] };

type Read = { readonly kind: 'taken'; readonly taken: Taken } | { readonly kind: 'refused'; readonly refused: Refused } | { readonly kind: 'none' };

const NONE: Read = { kind: 'none' };

const exchangeOf = (registry: Registry, name: string): Exchange | undefined =>
    registry.exchanges
        .filter((exchange) => name.startsWith(exchange.requestPrefix))
        .toSorted((a, b) => b.requestPrefix.length - a.requestPrefix.length)[0];

function readOne(registry: Registry, seen: SeenCheck, name: string, raw: string): Read {
    const exchange = exchangeOf(registry, name);
    if (exchange === undefined || raw === '') {
        return NONE;
    }
    const tool = toolName(name.slice(exchange.requestPrefix.length));
    const grammar = idGrammarOf(exchange.request);
    if (tool.kind === 'err' || grammar.kind === 'err') {
        return NONE;
    }
    const rawId = idTextOf(raw);
    if (requestId(rawId, grammar.value).kind === 'err') {
        return { kind: 'refused', refused: { exchange, tool: tool.value, rawId, answer: badIdValue(rawId) } };
    }
    const parsed = parseRequest(exchange, raw);
    if (parsed.kind === 'err' || seen(exchange.name, tool.value, parsed.value.id)) {
        return NONE;
    }
    return { kind: 'taken', taken: { exchange, tool: tool.value, id: parsed.value.id, value: parsed.value } };
}

export function take(registry: Registry, tokens: TokenMap, seen: SeenCheck): Taking {
    const taken: Taken[] = [];
    const refused: Refused[] = [];
    for (const [name, raw] of Object.entries(tokens)) {
        const read = readOne(registry, seen, name, raw);
        if (read.kind === 'taken') {
            taken.push(read.taken);
        }
        if (read.kind === 'refused') {
            refused.push(read.refused);
        }
    }
    return { taken, refused };
}

export function answer(exchange: Exchange, id: RequestId, stage: string): Result<TokenWrite, Refusal> {
    const name = answerToken(exchange);
    if (name.kind === 'err') {
        return name;
    }
    const value = answerValue(exchange, id, stage);
    return value.kind === 'err' ? value : ok({ name: name.value, value: value.value });
}
