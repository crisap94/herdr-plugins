import type { Count } from '#src/recap/domain/count.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { present } from './stats.ts';


export type Draw = () => Probability;

export function drawsOf(seed: Count): Draw {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return present(parseProbability(((t ^ (t >>> 14)) >>> 0) / 4_294_967_296));
    };
}

export function shuffledBy<T>(items: readonly T[], random: Draw): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const [here, there] = [out[i], out[j]];
        if (here !== undefined && there !== undefined) {
            out[i] = there;
            out[j] = here;
        }
    }
    return out;
}
