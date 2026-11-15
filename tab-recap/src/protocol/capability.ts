import { ok, must } from './result.ts';
import type { Result } from './result.ts';
import { parseExchangeName, parseExchangeVersion, parseTokenName, parseTokenValue, refuse } from './primitives.ts';
import type { ExchangeName, ExchangeVersion, OptIn, Refusal, TokenName, TokenValue } from './primitives.ts';
import type { Exchange } from './exchange.ts';

export const CAPABILITY_TOKEN: TokenName = must(parseTokenName('tab-recap-x'));

const KINDS = 'kinds';

const EXCHANGE_NAME = /^[a-z](?:[a-z0-9-]*[a-z-])?$/;

const EXCHANGE_ITEM = /^([a-z](?:[a-z0-9-]*[a-z-])?)([1-9][0-9]*)$/;

const KINDS_ITEM = /^kinds([1-9][0-9]*)$/;

export type ExchangeEntry = { readonly name: ExchangeName; readonly version: ExchangeVersion };

export type Capability = { readonly exchanges: readonly ExchangeEntry[]; readonly kinds: ExchangeVersion | null };

export interface ExchangeItem {
    readonly kind: 'exchange';
    readonly entry: ExchangeEntry;
}

export interface KindsItem {
    readonly kind: 'kinds';
    readonly version: ExchangeVersion;
}

type Entry = ExchangeItem | KindsItem;

type Offer = 'offered' | 'withheld';

type Enablement = 'enabled' | 'disabled';

const entryOf = (item: TokenValue): Entry | null => {
    const kinds = KINDS_ITEM.exec(item);
    if (kinds?.[1] !== undefined) {
        const version = parseExchangeVersion(Number(kinds[1]));
        return version.kind === 'ok' ? { kind: 'kinds', version: version.value } : null;
    }
    const [, name, digits] = EXCHANGE_ITEM.exec(item) ?? [];
    if (name === undefined || digits === undefined) {
        return null;
    }
    const exchangeName = parseExchangeName(name);
    const version = parseExchangeVersion(Number(digits));
    return exchangeName.kind === 'ok' && version.kind === 'ok' ? { kind: 'exchange', entry: { name: exchangeName.value, version: version.value } } : null;
};

const offerOf = (exchange: Exchange): Offer => (EXCHANGE_NAME.test(exchange.name) && exchange.name !== KINDS ? 'offered' : 'withheld');

const enablementOf = (isOn: (setting: OptIn) => boolean) => (exchange: Exchange): Enablement =>
    exchange.optIn === null || isOn(exchange.optIn) ? 'enabled' : 'disabled';

export function capabilityValue(exchanges: readonly Exchange[], kindsVersion: ExchangeVersion, isOn: (setting: OptIn) => boolean = (): boolean => true): Result<TokenValue, Refusal> {
    const offending = exchanges.find((exchange) => offerOf(exchange) === 'withheld');
    if (offending !== undefined) {
        return refuse('bad-grammar', offending.name);
    }
    const enabled = enablementOf(isOn);
    const items = exchanges.filter((exchange) => enabled(exchange) === 'enabled').map((exchange) => `${exchange.name}${exchange.version}`);
    return parseTokenValue([...items, `${KINDS}${kindsVersion}`].join(','));
}

export function parseCapability(raw: unknown): Result<Capability, Refusal> {
    const text = parseTokenValue(raw);
    if (text.kind === 'err') {
        return text;
    }
    const exchanges: ExchangeEntry[] = [];
    const kinds: ExchangeVersion[] = [];
    for (const item of text.value.split(',').map(parseTokenValue)) {
        const entry = item.kind === 'ok' ? entryOf(item.value) : null;
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
