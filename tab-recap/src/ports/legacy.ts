import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Shape } from '#src/recap/domain/board.ts';
import type { ClosedEvery, ColumnLayoutResult, Done, OpenResult, ResizeDirection } from './columns.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import type { Text } from '#src/recap/domain/text.ts';

export interface Columns {
    layout(tab: TabId): Promise<ColumnLayoutResult>;
    open(tab: TabId, target: Text, shape: Shape): Promise<OpenResult>;
    resize(pane: PaneId, direction: ResizeDirection, amount: Probability): Promise<Done>;
    close(pane: PaneId): Promise<Done>;
    closeEvery(): Promise<ClosedEvery>;
}

export interface LaneTokens {
    report(pane: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done>;
}

