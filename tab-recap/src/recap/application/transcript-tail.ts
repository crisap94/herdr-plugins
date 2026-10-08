// The newest turns of a task's lanes, read through each lane's own reader from the end of what it keeps. It moves no position: the recap's
// cursors are the recap job's alone.
import type { LaneCursor } from '#src/ports/recap-records.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { Entry, Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

/** How much of the end of a transcript is read. */
const TAIL_BYTES = 256 * 1024;
const ANY_KIND = '*';

/** The newest entries of `lanes` (those with a source), oldest first across them. Entries without a time keep the order of their lane. */
export async function tailOf(readers: readonly Transcripts[], lanes: readonly LaneCursor[]): Promise<readonly Entry[]> {
    const read = await Promise.all(lanes.filter((lane) => lane.transcript !== '').map(async (lane) => {
        const reader = readers.find((each) => each.agent === lane.agent) ?? readers.find((each) => each.agent === ANY_KIND);
        const chunk = reader === undefined ? null : await reader.read(lane.transcript, UNREAD, TAIL_BYTES);
        return chunk === null || isUnknown(chunk) ? [] : chunk.entries;
    }));
    return read.length < 2 ? read.flat() : read.flat().toSorted((a, b) => (a.at ?? 0) - (b.at ?? 0));
}
