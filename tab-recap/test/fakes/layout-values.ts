import { countOf } from '#src/recap/domain/count.ts';
import { uncheckedPaneId, uncheckedRatio } from '#src/recap/domain/ids.ts';
import type { Placed, Rect, Sizing, Split } from '#src/recap/domain/layout.ts';
import { textOf } from '#src/recap/domain/text.ts';

export const ratioOf = uncheckedRatio;

export const rectOf = (x: number, y: number, width: number, height: number): Rect => ({ x: countOf(x), y: countOf(y), width: countOf(width), height: countOf(height) });

export const placedOf = (pane: string, rect: Rect): Placed => ({ paneId: uncheckedPaneId(pane), rect });

export const splitOf = (direction: string, ratio: number, rect: Rect): Split => ({ direction: textOf(direction), ratio: uncheckedRatio(ratio), rect });

export const SIZING: Sizing = { fraction: uncheckedRatio(0.3), minCols: countOf(36), maxCols: countOf(64) };
