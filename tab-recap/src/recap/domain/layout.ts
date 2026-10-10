export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface Placed {
    readonly paneId: string;
    readonly rect: Rect;
}

export interface Split {
    readonly direction: string;
    readonly ratio: number;
    readonly rect: Rect;
}

export interface Sizing {
    readonly fraction: number;
    readonly minCols: number;
    readonly maxCols: number;
}

const right = (r: Rect): number => r.x + r.width;
const bottom = (r: Rect): number => r.y + r.height;

export type Axis = 'right' | 'down';

export function edgePane(panes: readonly Placed[], axis: Axis): Placed | null {
    const sorted = axis === 'right'
        ? panes.toSorted((a, b) => right(b.rect) - right(a.rect) || b.rect.height - a.rect.height || a.rect.y - b.rect.y)
        : panes.toSorted((a, b) => bottom(b.rect) - bottom(a.rect) || b.rect.width - a.rect.width || a.rect.x - b.rect.x);
    return sorted[0] ?? null;
}

export function targetCols(tabWidth: number, sizing: Sizing): number {
    const wanted = Math.round(tabWidth * sizing.fraction);
    return Math.max(sizing.minCols, Math.min(sizing.maxCols, wanted));
}

const contains = (outer: Rect, inner: Rect): boolean =>
    inner.x >= outer.x && inner.y >= outer.y && right(inner) <= right(outer) && bottom(inner) <= bottom(outer);

export function parentSplit(splits: readonly Split[], column: Rect, axis: Axis): Split | null {
    const onEdge = (s: Split): boolean => (axis === 'right'
        ? s.direction === 'right' && right(s.rect) === right(column)
        : s.direction === 'down' && bottom(s.rect) === bottom(column));
    const holding = splits
        .filter((s) => onEdge(s) && contains(s.rect, column))
        .toSorted((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
    return holding[0] ?? null;
}

export interface Move {
    readonly direction: 'left' | 'right' | 'up' | 'down';
    readonly amount: number;
}

const MIN_RATIO = 0.1;
const MAX_RATIO = 0.95;
const NEGLIGIBLE = 0.005;

export function moveFor(split: Split, cells: number, axis: Axis): Move | null {
    const side = axis === 'right';
    const share = cells / (side ? split.rect.width : split.rect.height);
    const wanted = Math.min(MAX_RATIO, Math.max(MIN_RATIO, 1 - share));
    const delta = wanted - split.ratio;
    if (Math.abs(delta) < NEGLIGIBLE) {
        return null;
    }
    const forward = side ? 'right' : 'down';
    const back = side ? 'left' : 'up';
    return { direction: delta > 0 ? forward : back, amount: Math.abs(delta) };
}
