import type { LaneCursor } from '#src/ports/recap-records.ts';
import { UNREAD, type Entry, sourcePathOf } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { countOf } from '#src/recap/domain/count.ts';

const TAIL_BYTES = countOf(256 * 1024);

export async function tailOf(readers: TranscriptRegistry, lanes: readonly LaneCursor[]): Promise<readonly Entry[]> {
    const read = await Promise.all(lanes.filter((lane) => lane.transcript !== '').map(async (lane) => {
        const reader = readers.readerFor(lane.agent);
        const chunk = reader === undefined ? null : await reader.read(sourcePathOf(lane.transcript), UNREAD, TAIL_BYTES);
        return chunk === null || isUnknown(chunk) ? [] : chunk.entries;
    }));
    return read.length < 2 ? read.flat() : read.flat().toSorted((a, b) => (a.at ?? 0) - (b.at ?? 0));
}
