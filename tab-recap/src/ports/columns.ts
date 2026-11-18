import type { Shape } from '#src/recap/domain/board.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Placed, Split } from '#src/recap/domain/layout.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export type { Columns } from './legacy.ts';
export type { ClosedAll, LayoutResult, TabLayout } from './twins/runs/legacy.ts';

export type OpenResult = { readonly kind: 'opened'; readonly pane: PaneId } | Unknown;

export type Done = { readonly kind: 'done' } | Unknown;

export type ResizeDirection = 'left' | 'right' | 'up' | 'down';

export interface ColumnLayout {
    readonly kind: 'layout';
    readonly width: Count;
    readonly height: Count;
    readonly focused: PaneId | null;
    readonly panes: readonly Placed[];
    readonly splits: readonly Split[];
}

export type ColumnLayoutResult = ColumnLayout | Unknown;

export interface ClosedTally {
    readonly kind: 'closed';
    readonly closed: Count;
    readonly failed: Count;
}

export type ClosedEvery = ClosedTally | Unknown;

export interface ColumnPanes {
    layout(tab: TabId): Promise<ColumnLayoutResult>;
    open(tab: TabId, target: Text, shape: Shape): Promise<OpenResult>;
    resize(pane: PaneId, direction: ResizeDirection, amount: Count): Promise<Done>;
    close(pane: PaneId): Promise<Done>;
    closeEvery(): Promise<ClosedEvery>;
}
