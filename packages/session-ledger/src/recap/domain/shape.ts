import type { RecapSections } from './legacy.ts';

export type ListSection = Exclude<keyof RecapSections, 'goal'>;

export const CAPS: Readonly<Record<ListSection, number>> = { now: 3, needs: 3, done: 5, decisions: 3, next: 5, links: 6, rules: 5 };

export const MAX_WORDS = 16;

export const NO_SECTIONS: RecapSections = { goal: '', now: [], needs: [], done: [], decisions: [], next: [], links: [], rules: [] };

export type { RecapSections } from './legacy.ts';
