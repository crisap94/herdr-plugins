import { createHash } from 'node:crypto';

// The fresh set (FRESH-1): seeded helpers shared by every eval's build, check and runner.
// Nothing here calls a model or reads a file; the runners pick the fresh set only with --fresh.

export const FRESH_SEED = 'fresh-1/2026-11-14';
export const FRESH_ITEMS = 24;

export function rngOf(seed: string): () => number {
    let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(state ^ (state >>> 15), state | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

export function shuffledOf<T>(list: readonly T[], seed: string): T[] {
    const rng = rngOf(seed);
    const out = [...list];
    for (let at = out.length - 1; at > 0; at -= 1) {
        const other = Math.floor(rng() * (at + 1));
        [out[at], out[other]] = [out[other] as T, out[at] as T];
    }
    return out;
}

const HOME = /\/home\/|\/Users\/|C:\\Users/iu;
const NAME = /crisap|herdr|tab-recap|homelab|omarchy|anthropic|[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/iu;
const URL_HOST = /https?:\/\/([a-z0-9.-]+)/giu;
const HOST = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(com|org|net|io|dev|local)\b/giu;

export function guardOf(text: string): readonly string[] {
    const reasons: string[] = [];
    if (HOME.test(text)) reasons.push('a home path');
    if (NAME.test(text)) reasons.push('a name that is not invented');
    const hosts = new Set<string>();
    for (const match of text.matchAll(URL_HOST)) hosts.add(match[1] ?? '');
    for (const match of text.matchAll(HOST)) hosts.add(match[0]);
    for (const host of hosts) {
        if (host !== '' && !host.endsWith('.test')) reasons.push(`host outside .test: ${host}`);
    }
    return reasons;
}

// A string of 40 characters or more that the fresh text shares with an old text (either one holds the other).
export function overlapOf(fresh: readonly string[], old: readonly string[]): readonly string[] {
    const known = old.filter((text) => text.length >= 40);
    const shared = fresh.filter((text) => text.length >= 40 && known.some((other) => text.includes(other) || other.includes(text)));
    return [...new Set(shared)];
}

// Six ids: one item per primary plant, in the order the seeded generator draws them, then filled to six.
export function sampleOf(rows: readonly { readonly id: string; readonly plants: readonly string[] }[], primaries: readonly string[]): readonly string[] {
    const order = shuffledOf(rows, FRESH_SEED);
    const picked: (typeof rows)[number][] = [];
    for (const primary of primaries) {
        if (picked.length >= 6) break;
        if (picked.some((row) => row.plants.includes(primary))) continue;
        const found = order.find((row) => row.plants.includes(primary) && !picked.includes(row));
        if (found !== undefined) picked.push(found);
    }
    for (const row of order) {
        if (picked.length >= 6) break;
        if (!picked.includes(row)) picked.push(row);
    }
    return rows.filter((row) => picked.includes(row)).map((row) => row.id);
}

function valueOf(argv: readonly string[], name: string): string | null {
    const at = argv.indexOf(name);
    if (at === -1) return null;
    const found = argv[at + 1];
    return found === undefined || found.startsWith('--') ? null : found;
}

// Which dataset a runner reads. Without --fresh it is the base set. With --fresh the run label must start with fresh-,
// so fresh answers never land in an existing run folder. --resume names the label only when --label is absent.
export function datasetOf(base: { readonly dataset: string; readonly items: number }, fresh: { readonly dataset: string; readonly items: number }, argv: readonly string[]): { readonly dataset: string; readonly items: number; readonly fresh: boolean } {
    if (!argv.includes('--fresh')) return { dataset: base.dataset, items: base.items, fresh: false };
    if (argv.includes('--smoke')) throw new Error('--smoke is not defined for the fresh set');
    const label = valueOf(argv, '--label') ?? (argv.includes('--resume') ? valueOf(argv, '--resume') : null);
    if (label === null || !label.startsWith('fresh-')) throw new Error('--fresh needs --label fresh-<name>');
    return { dataset: fresh.dataset, items: fresh.items, fresh: true };
}
