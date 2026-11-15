import type { BoundaryKind, Trigger } from '#src/recap/domain/boundary.ts';
import type { TabId } from '#src/recap/domain/ids.ts';

export interface Break {
    readonly kind: BoundaryKind;
    readonly at: number;
    readonly trigger: Trigger | null;
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly tookMs: number | null;
}

export interface Boundaries {
    breaksOf(tab: string): readonly Break[];
    chapterCount(tab: string): number;
    lastBreakAt(tab: TabId, pane: string): number | null;
}
