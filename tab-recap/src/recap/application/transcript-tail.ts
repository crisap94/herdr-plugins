import type { SessionCursor } from '@stateforge-labs/session-ledger';
import { UNREAD, type Entry, sourcePathOf } from '@stateforge-labs/session-ledger';
import { isUnknown } from '@stateforge-labs/session-ledger';
import type { TranscriptRegistry } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';

const TAIL_BYTES = countOf(256 * 1024);

export async function tailOf(readers: TranscriptRegistry, lanes: readonly SessionCursor[]): Promise<readonly Entry[]> {
    const read = await Promise.all(lanes.filter((lane) => lane.transcript !== '').map(async (lane) => {
        const reader = readers.readerFor(lane.agent);
        const chunk = reader === undefined ? null : await reader.read(sourcePathOf(lane.transcript), UNREAD, TAIL_BYTES);
        return chunk === null || isUnknown(chunk) ? [] : chunk.entries;
    }));
    return read.length < 2 ? read.flat() : read.flat().toSorted((a, b) => (a.at ?? 0) - (b.at ?? 0));
}
