import type { Brand } from './brand.ts';

export type FactId = Brand<string, 'FactId'>;
export type RunId = Brand<string, 'RunId'>;

export interface TaskId {
    readonly tab: string;
    readonly key: string;
}

export const SECTION_IDS = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules'] as const;
export type Section = (typeof SECTION_IDS)[number];

export const CLOSED_WHY = ['done', 'wrong', 'superseded', 'answered', 'merged', 'rewritten'] as const;
export type ClosedWhy = (typeof CLOSED_WHY)[number];

export const WRITER_CLOSES: readonly ClosedWhy[] = ['done', 'wrong', 'superseded', 'answered'];

export interface Fact {
    readonly id: FactId;
    readonly task: TaskId;
    readonly section: Section;
    readonly text: string;
    readonly why: string | null;
    readonly ref: string | null;
    readonly agent: string | null;
    readonly anchor: string | null;
    readonly firstAt: number;
    readonly lastAt: number;
    readonly state: 'open' | 'closed';
    readonly closedWhy: ClosedWhy | null;
    readonly closedAt: number | null;
    readonly language: string;
}

export const isSection = (value: unknown): value is Section => SECTION_IDS.some((section) => section === value);

export const isClosedWhy = (value: unknown): value is ClosedWhy => CLOSED_WHY.some((why) => why === value);

export const sameTask = (a: TaskId, b: TaskId): boolean => a.tab === b.tab && a.key === b.key;

export const isOpen = (fact: Fact): boolean => fact.state === 'open';
