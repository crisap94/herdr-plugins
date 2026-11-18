import type { RecapTask } from './tasks.ts';

export type TaskShape = Pick<RecapTask, 'id' | 'name' | 'lanes'>;

export type { PlacedLane } from './legacy.ts';
export { keptGrouping } from './legacy.ts';
