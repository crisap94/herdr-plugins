import type { Enabled, Shape } from './board.ts';
import type { Count } from './count.ts';
import type { SessionKey, ScopeId } from './ids.ts';
import type { SeenLane } from './lane.ts';
import type { Text } from './text.ts';
import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

export interface DeadColumn { readonly tab: ScopeId; readonly pane: SessionKey }

export interface SeenColumn { readonly tabId: Text; readonly paneId: Text; readonly shape: Shape; }

export interface Reconciliation {
    readonly focusedTab?: Text | null;
    readonly at?: Instant;
    readonly lanes: readonly SeenLane[];
    readonly panes: readonly Text[];
    readonly columns: readonly SeenColumn[];
    readonly widths: ReadonlyMap<Text, Count>;
    readonly tabs?: readonly ScopeId[];
    readonly dead?: readonly DeadColumn[];
}

export interface StatusObservation { readonly kind: 'status'; readonly pane: SessionKey; readonly status: Text; }
export interface SessionObservation { readonly kind: 'session'; readonly pane: SessionKey; readonly session: Text; }
export interface ColumnOpenedObservation { readonly kind: 'column-opened'; readonly tab: ScopeId; readonly pane: SessionKey; readonly shape: Shape; readonly at?: Instant; }
export interface SwitchedObservation { readonly kind: 'switched'; readonly enabled: Enabled; }
