import type { Lane } from './lane.ts';
import type { PaneId, TabId } from './ids.ts';
import type { Instant } from './time.ts';

/** A wide tab docks its column at the SIDE; a narrow one (a phone) gets a BAR along the bottom. */
export type Shape = 'side' | 'bar';

export interface Placement {
    readonly pane: PaneId;
    readonly shape: Shape;
    /** when the pane was created (ms), if we opened it ourselves: a snapshot requested before that cannot know it */
    readonly since?: number;
}

/** What the operator asked of a column: hide it, show it, or flip it from whatever it is NOW — decided by the board that applies the request, never by the one who sent it. */
export type Visibility = boolean | 'toggle';

/** What `hide` and `show` act on: one tab, or every tab. */
export type VisibilityTarget = { readonly tab: TabId } | 'all';

/** The operator's hidden columns, as saved: `all` is the blanket, `shown` the tabs shown again under it. */
export interface HiddenState {
    readonly all: boolean;
    readonly hidden: readonly string[];
    readonly shown: readonly string[];
}

export interface Board {
    readonly lanes: ReadonlyMap<PaneId, Lane>;
    /** tab → where its column is */
    readonly columns: ReadonlyMap<TabId, Placement>;
    /** tabs whose column has been asked for and not yet reported */
    readonly opening: ReadonlySet<TabId>;
    /** tab → when its column was closed by someone else, most recent last */
    readonly reopens: ReadonlyMap<TabId, readonly Instant[]>;
    /** tab → until when it is given up */
    readonly givenUp: ReadonlyMap<TabId, Instant>;
    /** tab → its width in cells, when known */
    readonly widths: ReadonlyMap<TabId, number>;
    /** the tab the operator is looking at, when known */
    readonly focused: TabId | null;
    readonly enabled: boolean;
    readonly seeded: boolean;
    /** tabs whose column the operator hid (their recaps keep being written) */
    readonly hidden: ReadonlySet<TabId>;
    /** every column hidden at once; `shown` are the tabs shown again since */
    readonly allHidden: boolean;
    readonly shown: ReadonlySet<TabId>;
}

export function emptyBoard(): Board {
    return {
        lanes: new Map(),
        columns: new Map(),
        opening: new Set(),
        reopens: new Map(),
        givenUp: new Map(),
        widths: new Map(),
        focused: null,
        enabled: true,
        seeded: false,
        hidden: new Set(),
        allHidden: false,
        shown: new Set(),
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
