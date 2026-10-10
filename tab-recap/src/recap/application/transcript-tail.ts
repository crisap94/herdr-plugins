import type { LaneCursor } from '#src/ports/recap-records.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { registryOf } from '#src/ports/transcripts.ts';
import type { TranscriptRegistryInput } from '#src/ports/transcripts.ts';

const TAIL_BYTES = 256 * 1024;
export async function tailOf(readers: TranscriptRegistryInput, lanes: readonly LaneCursor[]): Promise<readonly Entry[]> {
    const registry = registryOf(readers);
    const read = await Promise.all(lanes.filter((lane) => lane.transcript !== '').map(async (lane) => {
        const reader = registry.readerFor(lane.agent);
        const chunk = reader === undefined ? null : await reader.read(lane.transcript, UNREAD, TAIL_BYTES);
        return chunk === null || isUnknown(chunk) ? [] : chunk.entries;
    }));
    return read.length < 2 ? read.flat() : read.flat().toSorted((a, b) => (a.at ?? 0) - (b.at ?? 0));
}
