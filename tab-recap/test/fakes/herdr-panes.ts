// A fake herdr for pane tokens: the behaviour measured on herdr 0.9.3 that the protocol relies on. One flat map per pane, merged from every source:
// the last write of a name wins, `null` removes the name whoever wrote it, values are cut to 80 characters, names match `[A-Za-z0-9_-]{1,32}`,
// at most 16 names per source, and a time to live of at most 24 hours.
export const VALUE_MAX = 80;
export const NAME = /^[A-Za-z0-9_-]{1,32}$/;
export const TTL_MAX_MS = 86_400_000;
export const PER_SOURCE = 16;

interface Held {
    readonly value: string;
    readonly source: string;
    readonly expires: number;
}

export type Reply = { readonly ok: true } | { readonly ok: false; readonly code: string };

export class FakePanes {
    private readonly panes = new Map<string, Map<string, Held>>();
    private readonly now: () => number;

    constructor(now: () => number = (): number => 0) {
        this.now = now;
    }

    /** `pane.report_metadata`: the tokens of one source, merged into the pane's map. */
    report(pane: string, source: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Reply {
        const names = Object.keys(tokens);
        if (ttlMs > TTL_MAX_MS) {
            return { ok: false, code: 'ttl_too_long' };
        }
        if (names.some((name) => !NAME.test(name))) {
            return { ok: false, code: 'invalid_name' };
        }
        const mine = [...this.panes.get(pane)?.values() ?? []].filter((held) => held.source === source).length;
        const fresh = names.filter((name) => tokens[name] !== null && !this.panes.get(pane)?.has(name)).length;
        if (mine + fresh > PER_SOURCE) {
            return { ok: false, code: 'too_many_tokens' };
        }
        const map = this.panes.get(pane) ?? new Map<string, Held>();
        for (const name of names) {
            const value = tokens[name];
            if (value === null || value === undefined) {
                map.delete(name);
            } else {
                map.set(name, { value: value.slice(0, VALUE_MAX), source, expires: this.now() + ttlMs });
            }
        }
        this.panes.set(pane, map);
        return { ok: true };
    }

    /** The pane's tokens as a reader sees them now: the names whose time to live has not passed. */
    read(pane: string): Readonly<Record<string, string>> {
        return Object.fromEntries([...this.panes.get(pane) ?? new Map<string, Held>()].filter(([, held]) => held.expires > this.now()).map(([name, held]) => [name, held.value]));
    }
}
