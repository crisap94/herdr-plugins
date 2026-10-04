import type { Shape } from '#src/recap/domain/board.ts';
import type { Placed, Split } from '#src/recap/domain/layout.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Unknown } from './unknowable.ts';

export interface TabLayout {
    readonly kind: 'layout';
    readonly width: number;
    readonly height: number;
    /** the pane focused in this tab — focus returns here after a bar is docked */
    readonly focused: string | null;
    readonly panes: readonly Placed[];
    readonly splits: readonly Split[];
}

export type LayoutResult = TabLayout | Unknown;

export type OpenResult = { readonly kind: 'opened'; readonly pane: PaneId } | Unknown;

export type Done = { readonly kind: 'done' } | Unknown;

export interface Columns {
    layout(tab: TabId): Promise<LayoutResult>;
    open(tab: TabId, target: string, shape: Shape): Promise<OpenResult>;
    resize(pane: PaneId, direction: 'left' | 'right' | 'up' | 'down', amount: number): Promise<Done>;
    close(pane: PaneId): Promise<Done>;
    swap(source: PaneId, target: string): Promise<Done>;
    focus(pane: string): Promise<Done>;
}
