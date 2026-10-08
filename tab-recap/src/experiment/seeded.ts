// A seeded random source and the draws an experiment makes with it, so a corpus can be rebuilt. Pure.

/** mulberry32: a 32-bit seeded generator giving numbers in [0, 1). */
export function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
}

/** A copy in a seeded random order (Fisher–Yates). */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
}
