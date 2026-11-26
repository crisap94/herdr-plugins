import { brand, type Brand } from '@stateforge-labs/session-ledger';
import type { FollowedSession } from './lane.ts';
import type { SessionKey, ScopeId } from './ids.ts';
import type { Count } from '@stateforge-labs/session-ledger';
import type { RestoredLane } from './closures.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';

export type Shape = 'side' | 'bar';

export type Enabled = Brand<boolean, 'Enabled'>;

export const enabledOf = brand<boolean, 'Enabled'>;

export type Seeded = Brand<boolean, 'Seeded'>;

export const seededOf = brand<boolean, 'Seeded'>;

export type AllHidden = Brand<boolean, 'AllHidden'>;

export const allHiddenOf = brand<boolean, 'AllHidden'>;

export interface Placement { readonly pane: SessionKey; readonly shape: Shape; readonly since?: Instant; }

export interface HiddenState { readonly all: AllHidden; readonly hidden: readonly Text[]; readonly shown: readonly Text[]; }

export interface Board {
    readonly lanes: ReadonlyMap<SessionKey, FollowedSession>;
    readonly columns: ReadonlyMap<ScopeId, Placement>;
    readonly closing: ReadonlyMap<SessionKey, Instant>;
    readonly opening: ReadonlySet<ScopeId>;
    readonly reopens: ReadonlyMap<ScopeId, readonly Instant[]>;
    readonly givenUp: ReadonlyMap<ScopeId, Instant>;
    readonly widths: ReadonlyMap<ScopeId, Count>;
    readonly focused: ScopeId | null;
    readonly enabled: Enabled;
    readonly seeded: Seeded;
    readonly hidden: ReadonlySet<ScopeId>;
    readonly allHidden: AllHidden;
    readonly shown: ReadonlySet<ScopeId>;
    readonly persisted: readonly RestoredLane[] | null;
}

export type Visibility = boolean | 'toggle';

export type VisibilityTarget = { readonly tab: ScopeId } | 'all';

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

export function lanesOf(board: Board, tab: ScopeId): readonly FollowedSession[] {
    return [...board.lanes.values()].filter((lane) => lane.tab === tab);
}

export function tabsWithLanes(board: Board): readonly ScopeId[] {
    return [...new Set([...board.lanes.values()].map((lane) => lane.tab))].toSorted();
}

export function tabOfColumn(board: Board, pane: SessionKey): ScopeId | null {
    for (const [tab, column] of board.columns) {
        if (column.pane === pane) {
            return tab;
        }
    }
    return null;
}

export function watchSet(board: Board): readonly SessionKey[] {
    return [...board.lanes.keys()].toSorted();
}

export function withLanes(board: Board, lanes: ReadonlyMap<SessionKey, FollowedSession>): Board {
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

export function listsPane(board: Board, pane: SessionKey): Listed { return listedOf(board.lanes.has(pane)); }
