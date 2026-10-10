import { CAPABILITY_TOKEN, capabilityValue } from '#src/protocol/capability.ts';
import { compact } from '#src/protocol/exchanges/compact.ts';
import { EXCHANGES } from '#src/protocol/exchanges/index.ts';
import { KINDS_VERSION } from '#src/protocol/kinds.ts';
import { must } from '#src/protocol/result.ts';
import { ANSWER_TOKENS, OWNERS, answerNameOf } from './token-registry.ts';
import { API_TOKEN, NEEDS_TOKEN, RECAP_TOKEN, SHARE_TOKEN } from './lane-token-names.ts';
import { EVENT_TOKEN } from './event-token.ts';

export const PROTOCOL_VERSION = '1';
export const COMPACT_TOKEN = answerNameOf(compact);
const CAPABILITY_VALUE = must(capabilityValue(EXCHANGES, KINDS_VERSION));

const LANE_NAMES: readonly string[] = [API_TOKEN, SHARE_TOKEN, RECAP_TOKEN, NEEDS_TOKEN];

export const OWNED_TOKENS: readonly string[] = [...LANE_NAMES, ...ANSWER_TOKENS, CAPABILITY_TOKEN];

export const STATE_TOKENS: readonly string[] = [...LANE_NAMES, CAPABILITY_TOKEN];

export const PANE_WRITABLE: readonly string[] = OWNERS.writable;
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
        [CAPABILITY_TOKEN]: CAPABILITY_VALUE,
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
