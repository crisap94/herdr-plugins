import type { OptIn } from '#src/protocol/primitives.ts';
import { CAPABILITY_TOKEN } from '#src/protocol/capability.ts';
import { API_TOKEN, NEEDS_TOKEN, RECAP_TOKEN, SHARE_TOKEN } from '../../lane-token-names.ts';
import { CAPABILITY_VALUE, PROTOCOL_VERSION, capabilityValueOf } from '../../lane-capability.ts';

export const capabilityOf = (isOn: (setting: OptIn) => boolean): string => capabilityValueOf((setting) => (isOn(setting) ? 'on' : 'off'));

export interface LaneFacts { readonly share: number | null; readonly recapAt: number | null; readonly needs: number; }

export type TokenValues = Readonly<Record<string, string>>;

export function valuesOf(facts: LaneFacts, capability: string = CAPABILITY_VALUE): TokenValues {
    return {
        [API_TOKEN]: PROTOCOL_VERSION,
        ...(facts.share === null ? {} : { [SHARE_TOKEN]: String(facts.share) }),
        ...(facts.recapAt === null ? {} : { [RECAP_TOKEN]: String(facts.recapAt) }),
        [NEEDS_TOKEN]: String(facts.needs),
        [CAPABILITY_TOKEN]: capability,
    };
}

export interface Written { readonly values: TokenValues; readonly at: number; }

export function writeDue(previous: Written | null, values: TokenValues, now: number, ttlMs: number): TokenValues | null {
    if (previous === null) {
        return values;
    }
    const changed = Object.keys(values).some((name) => values[name] !== previous.values[name]) || Object.keys(previous.values).some((name) => !(name in values));
    return changed || now - previous.at >= ttlMs / 2 ? values : null;
}

export const clearing = (names: readonly string[]): Readonly<Record<string, null>> => Object.fromEntries(names.map((name) => [name, null]));

export const unownedName = (names: readonly string[], allowed: readonly string[]): string | null => names.find((name) => !allowed.includes(name)) ?? null;
