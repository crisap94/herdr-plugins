import { EVENT_TOKEN } from './event-token.ts';
import { LEASE } from './typing-lease.ts';

export const PROTOCOL_VERSION = '1';
export const API_TOKEN = 'tab-recap-api';
export const SHARE_TOKEN = 'tab-recap-share';
export const RECAP_TOKEN = 'tab-recap-recap';
export const NEEDS_TOKEN = 'tab-recap-needs';
export const COMPACT_TOKEN = 'tab-recap-compact';

export const OWNED_TOKENS: readonly string[] = [API_TOKEN, SHARE_TOKEN, RECAP_TOKEN, NEEDS_TOKEN, COMPACT_TOKEN];

export const STATE_TOKENS: readonly string[] = [API_TOKEN, SHARE_TOKEN, RECAP_TOKEN, NEEDS_TOKEN];

export const PANE_WRITABLE: readonly string[] = [...OWNED_TOKENS, EVENT_TOKEN, LEASE];
export const WORKSPACE_WRITABLE: readonly string[] = [EVENT_TOKEN];

export const unownedName = (names: readonly string[], allowed: readonly string[]): string | null => names.find((name) => !allowed.includes(name)) ?? null;

export interface LaneFacts {
    readonly share: number | null;
    readonly recapAt: number | null;
    readonly needs: number;
}

export type TokenValues = Readonly<Record<string, string>>;

export function valuesOf(facts: LaneFacts): TokenValues {
    return {
        [API_TOKEN]: PROTOCOL_VERSION,
        ...(facts.share === null ? {} : { [SHARE_TOKEN]: String(facts.share) }),
        ...(facts.recapAt === null ? {} : { [RECAP_TOKEN]: String(facts.recapAt) }),
        [NEEDS_TOKEN]: String(facts.needs),
    };
}

export interface Written {
    readonly values: TokenValues;
    readonly at: number;
}

export function writeDue(previous: Written | null, values: TokenValues, now: number, ttlMs: number): TokenValues | null {
    if (previous === null) {
        return values;
    }
    const changed = Object.keys(values).some((name) => values[name] !== previous.values[name]) || Object.keys(previous.values).some((name) => !(name in values));
    return changed || now - previous.at >= ttlMs / 2 ? values : null;
}

export const clearing = (names: readonly string[]): Readonly<Record<string, null>> => Object.fromEntries(names.map((name) => [name, null]));
