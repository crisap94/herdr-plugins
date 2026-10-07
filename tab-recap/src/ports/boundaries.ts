import type { BoundaryKind, Trigger } from '#src/recap/domain/boundary.ts';

/** One break of a session, as the timeline draws it; tokens come from the mark, else from the compaction record the plugin wrote. */
export interface Break {
    readonly kind: BoundaryKind;
    readonly at: number;
    readonly trigger: Trigger | null;
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly tookMs: number | null;
}

/** What the expanded view and the compaction brief read of a tab's chapters. */
export interface Boundaries {
    /** every break of the tab, oldest first; empty when none or when the store cannot be read */
    breaksOf(tab: string): readonly Break[];
    /** how many chapters the tab has (1 before the first break); 0 for a tab with no history */
    chapterCount(tab: string): number;
    /** when the lane's agent last broke (compacted, or a new conversation began in its pane); null when it has not */
    lastBreakAt(tab: string, pane: string): number | null;
}
