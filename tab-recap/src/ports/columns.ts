import type { Shape } from '#src/recap/domain/board.ts';
import type { Placed, Split } from '#src/recap/domain/layout.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Unknown } from './unknowable.ts';

export interface TabLayout {
    readonly kind: 'layout';
    readonly width: number;
    readonly height: number;
    /** the pane focused in this tab (informational: docking a column no longer touches focus) */
    readonly focused: string | null;
    readonly panes: readonly Placed[];
    readonly splits: readonly Split[];
}

export type LayoutResult = TabLayout | Unknown;

export type OpenResult = { readonly kind: 'opened'; readonly pane: PaneId } | Unknown;

export type Done = { readonly kind: 'done' } | Unknown;

/** How many of our columns were closed, and how many could not be. */
export type ClosedAll = { readonly kind: 'closed'; readonly closed: number; readonly failed: number } | Unknown;

export interface Columns {
    layout(tab: TabId): Promise<LayoutResult>;
    open(tab: TabId, target: string, shape: Shape): Promise<OpenResult>;
    resize(pane: PaneId, direction: 'left' | 'right' | 'up' | 'down', amount: number): Promise<Done>;
    close(pane: PaneId): Promise<Done>;
    /**
     * Every column of ours that herdr holds — tracked or not — closed, after ONE look at herdr for the whole batch.
     * For shutting down: a close that does its own look (the agent guard) is too slow to repeat 27 times in a second.
     */
    closeEvery(): Promise<ClosedAll>;
}
