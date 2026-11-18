export const PLUGIN_WITHIN_MS = 10 * 60_000;

export type BoundaryKind = 'compacted' | 'switched';
export type Trigger = 'auto' | 'manual' | 'plugin';

export type OwnTrigger = 'auto' | 'manual';

export type { LaneMark, Planned } from './legacy.ts';
export { chapterStart, compactedFrom, settledBefore, triggerOf } from './legacy.ts';
