import type { Brand } from './brand.ts';

export type FactId = Brand<string, 'FactId'>;
export type RunId = Brand<string, 'RunId'>;

export const SECTION_IDS = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules'] as const;
export type Section = (typeof SECTION_IDS)[number];

export const CLOSED_WHY = ['done', 'wrong', 'superseded', 'answered', 'merged', 'rewritten'] as const;
export type ClosedWhy = (typeof CLOSED_WHY)[number];

export const WRITER_CLOSES: readonly ClosedWhy[] = ['done', 'wrong', 'superseded', 'answered'];

export const isSection = (value: unknown): value is Section => SECTION_IDS.some((section) => section === value);

export const isClosedWhy = (value: unknown): value is ClosedWhy => CLOSED_WHY.some((why) => why === value);

export type { Fact, TaskId } from './legacy.ts';
export { isOpen, sameTask } from './legacy.ts';
