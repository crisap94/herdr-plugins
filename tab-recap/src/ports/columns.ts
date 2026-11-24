import type { Shape } from '#src/recap/domain/board.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Placed, Split } from '#src/recap/domain/layout.ts';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export type OpenResult = { readonly kind: 'opened'; readonly pane: SessionKey } | Unknown;

export type Done = { readonly kind: 'done' } | Unknown;

export type ResizeDirection = 'left' | 'right' | 'up' | 'down';

export interface ColumnLayout {
    readonly kind: 'layout';
    readonly width: Count;
    readonly height: Count;
    readonly focused: SessionKey | null;
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
    layout(tab: ScopeId): Promise<ColumnLayoutResult>;
    open(tab: ScopeId, target: Text, shape: Shape): Promise<OpenResult>;
    resize(pane: SessionKey, direction: ResizeDirection, amount: Probability): Promise<Done>;
    close(pane: SessionKey): Promise<Done>;
    closeEvery(): Promise<ClosedEvery>;
}
