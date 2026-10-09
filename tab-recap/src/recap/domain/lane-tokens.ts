// The lane tokens tab-recap publishes on a lane's pane: the protocol version, the context share, when the last recap was written and how many needs are open.
// Pure: the application reads the facts, this decides what to write and what to clear.
import { EVENT_TOKEN } from './event-token.ts';
import { LEASE } from './typing-lease.ts';

/** The protocol version. A breaking change to a token's name or value format raises it. */
export const PROTOCOL_VERSION = '1';
export const API_TOKEN = 'tab-recap-api';
export const SHARE_TOKEN = 'tab-recap-share';
export const RECAP_TOKEN = 'tab-recap-recap';
export const NEEDS_TOKEN = 'tab-recap-needs';
/** the answer to a `compact-req-<tool>` request: `<id>:<stage>` */
export const COMPACT_TOKEN = 'tab-recap-compact';

/** The names of a lane's own state, which the publisher writes and clears. */
export const OWNED_TOKENS: readonly string[] = [API_TOKEN, SHARE_TOKEN, RECAP_TOKEN, NEEDS_TOKEN, COMPACT_TOKEN];

/** The lane's state names: what the publisher writes, and writes `null` for when the fact is no longer known. */
export const STATE_TOKENS: readonly string[] = [API_TOKEN, SHARE_TOKEN, RECAP_TOKEN, NEEDS_TOKEN];

/** Every name tab-recap may write on a pane: its state, its events and its typing lease. Anything else is refused at the adapter's edge. */
export const PANE_WRITABLE: readonly string[] = [...OWNED_TOKENS, EVENT_TOKEN, LEASE];
/** Every name tab-recap may write on a workspace: its events. */
export const WORKSPACE_WRITABLE: readonly string[] = [EVENT_TOKEN];

/** The first name of `names` that is not in `allowed`; null when all are tab-recap's. */
export const unownedName = (names: readonly string[], allowed: readonly string[]): string | null => names.find((name) => !allowed.includes(name)) ?? null;

/** What a lane's pane carries, as the application read it; a fact that is unknown is left out of the tokens. */
export interface LaneFacts {
    /** the context share in percent, when the lane's agent says */
    readonly share: number | null;
    /** epoch milliseconds of the tab's last recap, when one was written */
    readonly recapAt: number | null;
    /** the number of open needs of the lane's tab */
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

/** What was last written on a pane, and when. */
export interface Written {
    readonly values: TokenValues;
    readonly at: number;
}

/** A write is due when nothing was written yet, a value changed, or half the time to live has passed. Null: nothing to write. */
export function writeDue(previous: Written | null, values: TokenValues, now: number, ttlMs: number): TokenValues | null {
    if (previous === null) {
        return values;
    }
    const changed = Object.keys(values).some((name) => values[name] !== previous.values[name]) || Object.keys(previous.values).some((name) => !(name in values));
    return changed || now - previous.at >= ttlMs / 2 ? values : null;
}

/** The names a pane is cleared of: each one set to null (herdr removes it whoever wrote it, so only ours are named). */
export const clearing = (names: readonly string[]): Readonly<Record<string, null>> => Object.fromEntries(names.map((name) => [name, null]));
