import { CAPABILITY_TOKEN, type SettingCheck } from '#src/protocol/capability.ts';
import { compact } from '#src/protocol/exchanges/compact.ts';
import { parseTokenName, parseTokenValue, type TokenName, type TokenValue } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { Milliseconds, Instant } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import { ANSWER_TOKENS, OWNERS, answerNameOf } from './token-registry.ts';
import { CAPABILITY_VALUE, PROTOCOL_VERSION, capabilityValueOf } from './lane-capability.ts';
import { API_TOKEN, NEEDS_TOKEN, RECAP_TOKEN, SHARE_TOKEN } from './lane-token-names.ts';
import { EVENT_TOKEN } from './event-token.ts';

export { CAPABILITY_VALUE, PROTOCOL_VERSION, capabilityValueOf } from './lane-capability.ts';

export const COMPACT_TOKEN = answerNameOf(compact);

const LANE_NAMES: readonly string[] = [API_TOKEN, SHARE_TOKEN, RECAP_TOKEN, NEEDS_TOKEN];

export const OWNED_TOKENS: readonly string[] = [...LANE_NAMES, ...ANSWER_TOKENS, CAPABILITY_TOKEN];

export const STATE_TOKENS: readonly string[] = [...LANE_NAMES, CAPABILITY_TOKEN];

export const PANE_WRITABLE: readonly string[] = OWNERS.writable;
export const WORKSPACE_WRITABLE: readonly string[] = [EVENT_TOKEN];

export interface LaneTokenFacts {
    readonly share: Count | null;
    readonly recapAt: Instant | null;
    readonly needs: Count;
}

export type TokenMap = ReadonlyMap<TokenName, TokenValue>;

export interface LaneWrite {
    readonly values: TokenMap;
    readonly at: Instant;
}

const API = must(parseTokenName(API_TOKEN));
const SHARE = must(parseTokenName(SHARE_TOKEN));
const RECAP = must(parseTokenName(RECAP_TOKEN));
const NEEDS = must(parseTokenName(NEEDS_TOKEN));
const PROTOCOL = must(parseTokenValue(PROTOCOL_VERSION));

const valueOfNumber = (count: Count | Instant): TokenValue => must(parseTokenValue(String(count)));

export function tokenValuesOf(facts: LaneTokenFacts, capability: TokenValue = CAPABILITY_VALUE): TokenMap {
    const entries: [TokenName, TokenValue][] = [[API, PROTOCOL]];
    if (facts.share !== null) {
        entries.push([SHARE, valueOfNumber(facts.share)]);
    }
    if (facts.recapAt !== null) {
        entries.push([RECAP, valueOfNumber(facts.recapAt)]);
    }
    entries.push([NEEDS, valueOfNumber(facts.needs)], [CAPABILITY_TOKEN, capability]);
    return new Map(entries);
}

export function writeDueOf(previous: LaneWrite | null, values: TokenMap, now: Instant, ttl: Milliseconds): TokenMap | null {
    if (previous === null) {
        return values;
    }
    const unchanged = previous.values.size === values.size && [...values].every(([name, value]) => previous.values.get(name) === value);
    return !unchanged || now - previous.at >= ttl / 2 ? values : null;
}

export const capabilityOf = (isOn: SettingCheck): TokenValue => capabilityValueOf(isOn);

export const clearing = (names: readonly TokenName[]): ReadonlyMap<TokenName, null> => new Map(names.map((name) => [name, null]));

export const unownedName = (names: readonly TokenName[], allowed: readonly TokenName[]): TokenName | null => names.find((name) => !allowed.includes(name)) ?? null;
