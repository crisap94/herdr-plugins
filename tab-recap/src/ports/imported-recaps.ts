import type { RunItem } from './run-inputs.ts';

export interface ImportedChapter {
    readonly n: number;
    readonly at: number;
    readonly items: readonly RunItem[];
}
