// Boundaries from the reads: the compactions an agent's own records show, handed to the store with the run, which records them in its transaction.
import type { Lane } from '#src/recap/domain/lane.ts';
import type { LaneMark } from '#src/recap/domain/boundary.ts';
import type { Chunk } from '#src/ports/transcripts.ts';

/** What one lane's read gave: its lane and the chunk, null when it could not be read. */
export interface Read {
    readonly lane: Pick<Lane, 'pane'>;
    readonly chunk: Chunk | null;
}

/**
 * The compactions the reads found. A record that carries no time is dated by the read (`now`), which is only safe when the read's cursor
 * moves on (`advanced`): a failed run reads the same records again, and a guessed time would record the same compaction twice.
 */
export function marksOf(reads: readonly Read[], now: number, advanced: boolean): readonly LaneMark[] {
    return reads.flatMap((read) => (read.chunk?.marks ?? []).flatMap((mark) => {
        if (mark.kind !== 'compacted' || (mark.at === null && !advanced) || read.chunk === null) {
            return [];
        }
        return [{
            pane: String(read.lane.pane), at: mark.at ?? now, cursor: read.chunk.position.cursor,
            ...(mark.tokensBefore === undefined ? {} : { tokensBefore: mark.tokensBefore }),
            ...(mark.tokensAfter === undefined ? {} : { tokensAfter: mark.tokensAfter }),
            ...(mark.tookMs === undefined ? {} : { tookMs: mark.tookMs }),
            ...(mark.trigger === undefined ? {} : { trigger: mark.trigger }),
        }];
    }));
}
