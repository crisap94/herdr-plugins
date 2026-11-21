import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { instant, parseMilliseconds } from '#src/recap/domain/time.ts';
import { countEdits as countTypedEdits, EditCache as TypedEditCache, EditTally } from '../../edit-tally.ts';

export interface FileCount {
    readonly path: string;
    readonly count: number;
}

export function countEdits(paths: readonly string[]): readonly FileCount[] {
    return countTypedEdits(paths.map((path) => must(parseText(path))));
}

export class EditCounts {
    readonly tally: EditTally;

    constructor(transcripts: TranscriptRegistry) {
        this.tally = new EditTally(transcripts);
    }

    of(lanes: readonly LaneCursor[]): Promise<readonly FileCount[]> {
        return this.tally.of(lanes);
    }
}

export class EditCache {
    private readonly cache: TypedEditCache;

    constructor(counts: EditCounts, every = 60_000) {
        this.cache = new TypedEditCache(counts.tally, must(parseMilliseconds(every)));
    }

    of(lanes: readonly LaneCursor[], now: number): readonly FileCount[] {
        return this.cache.of(lanes, instant(now));
    }
}
