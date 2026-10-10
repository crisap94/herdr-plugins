import type { Lane } from '#src/recap/domain/lane.ts';
import type { LaneMark } from '#src/recap/domain/boundary.ts';
import type { Chunk } from '#src/ports/transcripts.ts';

export interface Read {
    readonly lane: Pick<Lane, 'pane'>;
    readonly chunk: Chunk | null;
}

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
