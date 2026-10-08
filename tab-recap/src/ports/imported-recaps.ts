import type { RunItem } from './run-inputs.ts';

/** The last good 1.x recap of one chapter of a tab: its items as a state to judge (keys `state/<task>/<section>/<position>`), and when that recap was written (epoch ms). */
export interface ImportedChapter {
    readonly n: number;
    readonly at: number;
    readonly items: readonly RunItem[];
}
