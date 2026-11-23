import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { Lane } from './lane.ts';
import type { PaneId, TabId } from './ids.ts';
import type { Count } from './count.ts';
import type { RestoredLane } from './closures.ts';
import type { Text } from './text.ts';
import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

export type Shape = 'side' | 'bar';

export type Enabled = Brand<boolean, 'Enabled'>;

export const enabledOf = brand<boolean, 'Enabled'>;

export type Seeded = Brand<boolean, 'Seeded'>;

export const seededOf = brand<boolean, 'Seeded'>;

export type AllHidden = Brand<boolean, 'AllHidden'>;

export const allHiddenOf = brand<boolean, 'AllHidden'>;

export interface Placement { readonly pane: PaneId; readonly shape: Shape; readonly since?: Instant; }

export interface HiddenState { readonly all: AllHidden; readonly hidden: readonly Text[]; readonly shown: readonly Text[]; }

export interface Board {
    readonly lanes: ReadonlyMap<PaneId, Lane>;
    readonly columns: ReadonlyMap<TabId, Placement>;
    readonly closing: ReadonlyMap<PaneId, Instant>;
    readonly opening: ReadonlySet<TabId>;
    readonly reopens: ReadonlyMap<TabId, readonly Instant[]>;
    readonly givenUp: ReadonlyMap<TabId, Instant>;
    readonly widths: ReadonlyMap<TabId, Count>;
    readonly focused: TabId | null;
    readonly enabled: Enabled;
    readonly seeded: Seeded;
    readonly hidden: ReadonlySet<TabId>;
    readonly allHidden: AllHidden;
    readonly shown: ReadonlySet<TabId>;
    readonly persisted: readonly RestoredLane[] | null;
}

export type Visibility = boolean | 'toggle';

export type VisibilityTarget = { readonly tab: TabId } | 'all';

export function emptyBoard(): Board {
    return {
        lanes: new Map(),
        columns: new Map(),
        closing: new Map(),
        opening: new Set(),
        reopens: new Map(),
        givenUp: new Map(),
        widths: new Map(),
        focused: null,
        enabled: enabledOf(true),
        seeded: seededOf(false),
        hidden: new Set(),
        allHidden: allHiddenOf(false),
        shown: new Set(),
        persisted: null,
    };
}

export function lanesOf(board: Board, tab: TabId): readonly Lane[] {
    return [...board.lanes.values()].filter((lane) => lane.tab === tab);
}

export function tabsWithLanes(board: Board): readonly TabId[] {
    return [...new Set([...board.lanes.values()].map((lane) => lane.tab))].toSorted();
}

export function tabOfColumn(board: Board, pane: PaneId): TabId | null {
    for (const [tab, column] of board.columns) {
        if (column.pane === pane) {
            return tab;
        }
    }
    return null;
}

export function watchSet(board: Board): readonly PaneId[] {
    return [...board.lanes.keys()].toSorted();
}

export function withLanes(board: Board, lanes: ReadonlyMap<PaneId, Lane>): Board {
    return { ...board, lanes };
}

export function put<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> {
    const next = new Map(map);
    next.set(key, value);
    return next;
}

export function without<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
    if (!map.has(key)) {
        return map;
    }
    const next = new Map(map);
    next.delete(key);
    return next;
}

export function added<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
    return new Set([...set, value]);
}

export function removed<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
    if (!set.has(value)) {
        return set;
    }
    const next = new Set(set);
    next.delete(value);
    return next;
}

export type Listed = Brand<boolean, 'Listed'>;

export const listedOf = brand<boolean, 'Listed'>;

export function listsPane(board: Board, pane: PaneId): Listed { return listedOf(board.lanes.has(pane)); }
