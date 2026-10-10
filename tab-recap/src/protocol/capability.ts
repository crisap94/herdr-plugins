import { ok } from './result.ts';
import type { Result } from './result.ts';
import { refuse, tokenValue } from './primitives.ts';
import type { ExchangeVersion, Refusal, TokenName, TokenValue } from './primitives.ts';
import type { Exchange } from './exchange.ts';

export const CAPABILITY_TOKEN = 'tab-recap-x' as TokenName;

const KINDS = 'kinds';

const EXCHANGE_NAME = /^[a-z](?:[a-z0-9-]*[a-z-])?$/;

const EXCHANGE_ITEM = /^([a-z](?:[a-z0-9-]*[a-z-])?)([1-9][0-9]*)$/;

const KINDS_ITEM = /^kinds([1-9][0-9]*)$/;

export type ExchangeEntry = { readonly name: string; readonly version: number };

export type Capability = { readonly exchanges: readonly ExchangeEntry[]; readonly kinds: number | null };

type Entry = { readonly kind: 'exchange'; readonly entry: ExchangeEntry } | { readonly kind: 'kinds'; readonly version: number };

const entryOf = (item: string): Entry | null => {
    const kinds = KINDS_ITEM.exec(item);
    if (kinds?.[1] !== undefined) {
        return { kind: 'kinds', version: Number(kinds[1]) };
    }
    const [, name, digits] = EXCHANGE_ITEM.exec(item) ?? [];
    return name === undefined || digits === undefined ? null : { kind: 'exchange', entry: { name, version: Number(digits) } };
};

const unofferable = (exchange: Exchange): boolean => !EXCHANGE_NAME.test(exchange.name) || exchange.name === KINDS;

export function capabilityValue(exchanges: readonly Exchange[], kindsVersion: ExchangeVersion): Result<TokenValue, Refusal> {
    const offending = exchanges.find(unofferable);
    if (offending !== undefined) {
        return refuse('bad-grammar', offending.name);
    }
    const items = exchanges.map((exchange) => `${exchange.name}${exchange.version}`);
    return tokenValue([...items, `${KINDS}${kindsVersion}`].join(','));
}

export function parseCapability(raw: string): Result<Capability, Refusal> {
    const exchanges: ExchangeEntry[] = [];
    const kinds: number[] = [];
    for (const item of raw.split(',')) {
        const entry = entryOf(item);
        if (entry === null) {
            return refuse('bad-grammar', 'capability');
        }
        if (entry.kind === 'kinds') {
            kinds.push(entry.version);
        } else {
            exchanges.push(entry.entry);
        }
    }
    return kinds.length > 1 ? refuse('bad-grammar', 'capability') : ok({ exchanges, kinds: kinds[0] ?? null });
}
