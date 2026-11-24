import { brand, type Brand } from './brand.ts';
import type { ScopeId } from './lane-shape.ts';
import type { Text } from './text.ts';
import type { Instant } from './time.ts';

export type FactId = Brand<string, 'FactId'>;
export const factIdOf = brand<string, 'FactId'>;
export type RunId = Brand<string, 'RunId'>;

export const SECTION_IDS = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules'] as const;
export type Section = (typeof SECTION_IDS)[number];

export const CLOSED_WHY = ['done', 'wrong', 'superseded', 'answered', 'merged', 'rewritten'] as const;
export type ClosedWhy = (typeof CLOSED_WHY)[number];

export const WRITER_CLOSES: readonly ClosedWhy[] = ['done', 'wrong', 'superseded', 'answered'];

export const isSection = (value: unknown): value is Section => SECTION_IDS.some((section) => section === value);

export const isClosedWhy = (value: unknown): value is ClosedWhy => CLOSED_WHY.some((why) => why === value);

export interface TaskId { readonly tab: ScopeId; readonly key: Text; }

export interface Fact { readonly id: FactId; readonly task: TaskId; readonly section: Section; readonly text: Text; readonly why: Text | null; readonly ref: Text | null; readonly agent: Text | null; readonly anchor: Text | null; readonly firstAt: Instant; readonly lastAt: Instant; readonly state: 'open' | 'closed'; readonly closedWhy: ClosedWhy | null; readonly closedAt: Instant | null; readonly language: Text; }

export type SameTask = Brand<boolean, 'SameTask'>;

export const sameTask = (a: TaskId, b: TaskId): SameTask => brand<boolean, 'SameTask'>(a.tab === b.tab && a.key === b.key);

export type OpenFact = Fact & { readonly state: 'open' };

export const isOpen = (fact: Fact): fact is OpenFact => fact.state === 'open';
