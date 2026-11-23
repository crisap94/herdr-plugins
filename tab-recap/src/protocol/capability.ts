import { ok, must } from '@stateforge-labs/session-ledger/unstable/protocol/result.ts';
import type { Result } from '@stateforge-labs/session-ledger/unstable/protocol/result.ts';
import { parseOfferedName, parseOfferedVersion, parseTokenName, parseTokenValue, parseWireText, refuse } from './primitives.ts';
import type { ExchangeVersion, OfferedName, OfferedVersion, OptIn, Refusal, TokenName, TokenValue, WireText } from './primitives.ts';
import type { Exchange } from './exchange.ts';

export const CAPABILITY_TOKEN: TokenName = must(parseTokenName('tab-recap-x'));

const KINDS = 'kinds';

const EXCHANGE_NAME = /^[a-z](?:[a-z0-9-]*[a-z-])?$/;

const EXCHANGE_ITEM = /^([a-z](?:[a-z0-9-]*[a-z-])?)([1-9][0-9]*)$/;

const KINDS_ITEM = /^kinds([1-9][0-9]*)$/;

export type ExchangeEntry = { readonly name: OfferedName; readonly version: OfferedVersion };

export type Capability = { readonly exchanges: readonly ExchangeEntry[]; readonly kinds: OfferedVersion | null };

export interface ExchangeItem {
    readonly kind: 'exchange';
    readonly entry: ExchangeEntry;
}

export interface KindsItem {
    readonly kind: 'kinds';
    readonly version: OfferedVersion;
}

type Entry = ExchangeItem | KindsItem;

type Offer = 'offered' | 'withheld';

type Enablement = 'enabled' | 'disabled';

export type Setting = 'on' | 'off';

export type SettingCheck = (setting: OptIn) => Setting;

const ALWAYS_ON: SettingCheck = () => 'on';

const entryOf = (item: WireText): Entry | null => {
    const kinds = KINDS_ITEM.exec(item);
    if (kinds?.[1] !== undefined) {
        return { kind: 'kinds', version: parseOfferedVersion(kinds[1]) };
    }
    const [, name, digits] = EXCHANGE_ITEM.exec(item) ?? [];
    return name === undefined || digits === undefined ? null : { kind: 'exchange', entry: { name: parseOfferedName(name), version: parseOfferedVersion(digits) } };
};

const offerOf = (exchange: Exchange): Offer => (EXCHANGE_NAME.test(exchange.name) && exchange.name !== KINDS ? 'offered' : 'withheld');

const enablementOf = (isOn: SettingCheck) => (exchange: Exchange): Enablement =>
    exchange.optIn === null || isOn(exchange.optIn) === 'on' ? 'enabled' : 'disabled';

export function capabilityValueTyped(exchanges: readonly Exchange[], kindsVersion: ExchangeVersion, isOn: SettingCheck = ALWAYS_ON): Result<TokenValue, Refusal> {
    const offending = exchanges.find((exchange) => offerOf(exchange) === 'withheld');
    if (offending !== undefined) {
        return refuse('bad-grammar', offending.name);
    }
    const enabled = enablementOf(isOn);
    const items = exchanges.filter((exchange) => enabled(exchange) === 'enabled').map((exchange) => `${exchange.name}${exchange.version}`);
    return parseTokenValue([...items, `${KINDS}${kindsVersion}`].join(','));
}

export function parseCapability(raw: unknown): Result<Capability, Refusal> {
    const text = parseWireText(raw);
    if (text.kind === 'err') {
        return refuse(text.error, 'capability');
    }
    const exchanges: ExchangeEntry[] = [];
    const kinds: OfferedVersion[] = [];
    for (const item of text.value.split(',').map(parseWireText)) {
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
