import { ok } from '@stateforge-labs/session-ledger/unstable/protocol/result.ts';
import type { Result } from '@stateforge-labs/session-ledger/unstable/protocol/result.ts';
import { parseIdText, parseRequestId, parseToolName } from './primitives.ts';
import type { ExchangeName, IdText, Refusal, RequestId, TokenValue, ToolName, WireText } from './primitives.ts';
import { answerToken, answerValue, badIdValue, parseRequest } from './exchange.ts';
import type { Exchange } from './exchange.ts';
import { idGrammarOf } from './codec.ts';
import type { ParsedValue } from './codec.ts';
import type { Registry } from './registry.ts';
import type { TokenWrite } from './tokens.ts';

export type { SeenCheck } from './legacy.ts';

export { answer, take } from './legacy.ts';

export type Seen = 'seen' | 'fresh';

export type SeenProbe = (exchange: ExchangeName, tool: ToolName, id: RequestId) => Seen;

export type Taken = { readonly exchange: Exchange; readonly tool: ToolName; readonly id: RequestId; readonly value: ParsedValue };

export type Refused = { readonly exchange: Exchange; readonly tool: ToolName; readonly rawId: IdText; readonly answer: TokenValue };

export type Taking = { readonly taken: readonly Taken[]; readonly refused: readonly Refused[] };

type Read = { readonly kind: 'taken'; readonly taken: Taken } | { readonly kind: 'refused'; readonly refused: Refused } | { readonly kind: 'none' };

const NONE: Read = { kind: 'none' };

const longerPrefix = (name: WireText) => (best: Exchange | undefined, candidate: Exchange): Exchange | undefined =>
    name.startsWith(candidate.requestPrefix) && (best === undefined || candidate.requestPrefix.length > best.requestPrefix.length) ? candidate : best;

function readOne(registry: Registry, seen: SeenProbe, name: WireText, raw: WireText): Read {
    const exchange = registry.exchanges.reduce<Exchange | undefined>(longerPrefix(name), undefined);
    if (exchange === undefined || raw === '') {
        return NONE;
    }
    const tool = parseToolName(name.slice(exchange.requestPrefix.length));
    const grammar = idGrammarOf(exchange.request);
    if (tool.kind === 'err' || grammar.kind === 'err') {
        return NONE;
    }
    const rawId = parseIdText(raw);
    if (parseRequestId(rawId, grammar.value).kind === 'err') {
        return { kind: 'refused', refused: { exchange, tool: tool.value, rawId, answer: badIdValue(rawId) } };
    }
    const parsed = parseRequest(exchange, raw);
    if (parsed.kind === 'err' || seen(exchange.name, tool.value, parsed.value.id) === 'seen') {
        return NONE;
    }
    return { kind: 'taken', taken: { exchange, tool: tool.value, id: parsed.value.id, value: parsed.value } };
}

export function takeRequests(registry: Registry, tokens: ReadonlyMap<WireText, WireText>, seen: SeenProbe): Taking {
    const taken: Taken[] = [];
    const refused: Refused[] = [];
    for (const [name, raw] of tokens) {
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

export function answerWrite(exchange: Exchange, id: RequestId, stage: WireText): Result<TokenWrite, Refusal> {
    const name = answerToken(exchange);
    if (name.kind === 'err') {
        return name;
    }
    const value = answerValue(exchange, parseIdText(id), stage);
    return value.kind === 'err' ? value : ok({ name: name.value, value: value.value });
}
