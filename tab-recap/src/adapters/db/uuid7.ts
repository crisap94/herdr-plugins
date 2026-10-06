// UUIDv7 (RFC 9562 §5.7): 48 bits of Unix milliseconds, version 7, variant 10, the rest random. Monotonic within one
// process (§6.2): when the millisecond has not advanced, a 12-bit counter in `rand_a` goes up; when it overflows the
// millisecond is bumped. The id carries ONLY its creation time — everything else about a row is a column.

export interface Uuid7Sources {
    /** Unix milliseconds */
    readonly now: () => number;
    readonly random: (bytes: Uint8Array) => void;
}

const COUNTER_MAX = 0xfff;
/** a fresh counter starts in the lower half, leaving room to count up inside one millisecond */
const COUNTER_SEED = 0x7ff;

const SYSTEM: Uuid7Sources = { now: Date.now, random: (bytes) => { crypto.getRandomValues(bytes); } };

export class Uuid7Generator {
    private readonly sources: Uuid7Sources;
    private lastMs = -1;
    private counter = 0;

    constructor(sources: Uuid7Sources = SYSTEM) {
        this.sources = sources;
    }

    private seed(): number {
        const bytes = new Uint8Array(2);
        this.sources.random(bytes);
        return (((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0)) & COUNTER_SEED;
    }

    /** The millisecond this id is stamped with, and its counter: strictly above the previous id's, whatever the clock does. */
    private tick(): void {
        const ms = this.sources.now();
        if (ms > this.lastMs) {
            this.lastMs = ms;
            this.counter = this.seed();
            return;
        }
        this.counter += 1;
        if (this.counter > COUNTER_MAX) {
            this.lastMs += 1;
            this.counter = this.seed();
        }
    }

    next(): Uint8Array {
        this.tick();
        const id = new Uint8Array(16);
        this.sources.random(id);
        const ms = this.lastMs;
        for (let at = 0; at < 6; at += 1) {
            id[at] = Math.floor(ms / 2 ** (8 * (5 - at))) % 256;
        }
        id[6] = 0x70 | (this.counter >> 8);
        id[7] = this.counter & 0xff;
        id[8] = 0x80 | ((id[8] ?? 0) & 0x3f);
        return id;
    }
}

/** The creation time inside an id, in Unix milliseconds. */
export function timeOf(id: Uint8Array): number {
    return id.slice(0, 6).reduce((ms, byte) => ms * 256 + byte, 0);
}

/** The ids as bytes compare: oldest first. */
export function compareIds(a: Uint8Array, b: Uint8Array): number {
    for (let at = 0; at < 16; at += 1) {
        const difference = (a[at] ?? 0) - (b[at] ?? 0);
        if (difference !== 0) {
            return difference;
        }
    }
    return 0;
}

/** One generator for the process, so ids made by different repositories stay in order. */
export const ids = new Uuid7Generator();
