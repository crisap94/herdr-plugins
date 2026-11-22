import { countOf } from './count.ts';
import type { Count } from './count.ts';
import { uncheckedRatio } from './ids.ts';
import type { PaneId } from './ids.ts';
import type { Presence } from './presence.ts';
import type { Probability } from './probability.ts';
import type { Text } from './text.ts';

export interface Rect {
    readonly x: Count;
    readonly y: Count;
    readonly width: Count;
    readonly height: Count;
}

export interface Placed {
    readonly paneId: PaneId;
    readonly rect: Rect;
}

export interface Split {
    readonly direction: Text;
    readonly ratio: Probability;
    readonly rect: Rect;
}

export interface Sizing {
    readonly fraction: Probability;
    readonly minCols: Count;
    readonly maxCols: Count;
}

type Order = -1 | 0 | 1;

const order = (a: Count, b: Count): Order => {
    if (a < b) {
        return -1;
    }
    return a > b ? 1 : 0;
};

const right = (r: Rect): Count => countOf(r.x + r.width);
const bottom = (r: Rect): Count => countOf(r.y + r.height);
const areaOf = (r: Rect): Count => countOf(r.width * r.height);

export type Axis = 'right' | 'down';

export function edgePane(panes: readonly Placed[], axis: Axis): Placed | null {
    const sorted = axis === 'right'
        ? panes.toSorted((a, b) => order(right(b.rect), right(a.rect)) || order(b.rect.height, a.rect.height) || order(a.rect.y, b.rect.y))
        : panes.toSorted((a, b) => order(bottom(b.rect), bottom(a.rect)) || order(b.rect.width, a.rect.width) || order(a.rect.x, b.rect.x));
    return sorted[0] ?? null;
}

export function targetCols(tabWidth: Count, sizing: Sizing): Count {
    const wanted = Math.round(tabWidth * sizing.fraction);
    return countOf(Math.max(sizing.minCols, Math.min(sizing.maxCols, wanted)));
}

const contains = (outer: Rect, inner: Rect): Presence =>
    inner.x >= outer.x && inner.y >= outer.y && right(inner) <= right(outer) && bottom(inner) <= bottom(outer) ? 'present' : 'absent';

export function parentSplit(splits: readonly Split[], column: Rect, axis: Axis): Split | null {
    const onEdge = (s: Split): Presence => ((axis === 'right'
        ? s.direction === 'right' && right(s.rect) === right(column)
        : s.direction === 'down' && bottom(s.rect) === bottom(column)) ? 'present' : 'absent');
    const holding = splits
        .filter((s) => onEdge(s) === 'present' && contains(s.rect, column) === 'present')
        .toSorted((a, b) => order(areaOf(a.rect), areaOf(b.rect)));
    return holding[0] ?? null;
}

export interface Move {
    readonly direction: 'left' | 'right' | 'up' | 'down';
    readonly amount: Probability;
}

const MIN_RATIO = 0.1;
const MAX_RATIO = 0.95;
const NEGLIGIBLE = 0.005;

export function moveFor(split: Split, cells: Count, axis: Axis): Move | null {
    const side = axis === 'right';
    const share = cells / (side ? split.rect.width : split.rect.height);
    const wanted = Math.min(MAX_RATIO, Math.max(MIN_RATIO, 1 - share));
    const delta = wanted - split.ratio;
    if (Math.abs(delta) < NEGLIGIBLE) {
        return null;
    }
    const forward = side ? 'right' : 'down';
    const back = side ? 'left' : 'up';
    return { direction: delta > 0 ? forward : back, amount: uncheckedRatio(Math.abs(delta)) };
}
