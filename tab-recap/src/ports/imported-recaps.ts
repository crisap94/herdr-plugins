import type { Count } from '#src/recap/domain/count.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { RunItem } from './run-inputs.ts';

export type { ImportedChapter } from './legacy.ts';

export interface ImportedChapterRecord {
    readonly n: Count;
    readonly at: Instant;
    readonly items: readonly RunItem[];
}
