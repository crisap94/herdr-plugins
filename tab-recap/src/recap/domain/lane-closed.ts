import type { Brand } from './brand.ts';

export type LaneClosedWhy = Brand<string, 'LaneClosedWhy'>;

export const LANE_CLOSED = 'lane closed' as LaneClosedWhy;

export const CLOSE_POINTS = ['status-check', 'before-writer', 'after-writer', 'before-rewrite', 'before-typing'] as const;

export type ClosePoint = (typeof CLOSE_POINTS)[number];
