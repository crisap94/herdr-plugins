import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Lane } from '#src/recap/domain/lane-shape.ts';
import type { LaneMark } from '#src/recap/domain/boundary.ts';
import type { Chunk } from '#src/ports/transcripts.ts';

export type Advanced = Brand<boolean, 'Advanced'>;

export const ADVANCED = brand<boolean, 'Advanced'>(true);
export const NOT_ADVANCED = brand<boolean, 'Advanced'>(false);

export interface Read {
    readonly lane: Pick<Lane, 'pane'>;
    readonly chunk: Chunk | null;
}

export function marksOf(reads: readonly Read[], now: Instant, advanced: Advanced): readonly LaneMark[] {
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
