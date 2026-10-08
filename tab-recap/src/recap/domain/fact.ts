// The ledger's unit: a line of a task's recap that has an identity. Pure data; the fold that changes it is in ops.ts.
import type { Brand } from './brand.ts';

export type FactId = Brand<string, 'FactId'>;
export type RunId = Brand<string, 'RunId'>;

/** A task of a tab: the tab, and the task's key within it (`t1`). */
export interface TaskId {
    readonly tab: string;
    readonly key: string;
}

export const SECTION_IDS = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules'] as const;
export type Section = (typeof SECTION_IDS)[number];

export const CLOSED_WHY = ['done', 'wrong', 'superseded', 'answered', 'merged', 'rewritten'] as const;
export type ClosedWhy = (typeof CLOSED_WHY)[number];

/** What the writer may close a fact as; `merged` and `rewritten` belong to the curator and the import. */
export const WRITER_CLOSES: readonly ClosedWhy[] = ['done', 'wrong', 'superseded', 'answered'];

export interface Fact {
    readonly id: FactId;
    readonly task: TaskId;
    readonly section: Section;
    /** at most 16 words, one line */
    readonly text: string;
    /** at most 24 words; required for decisions and for a close */
    readonly why: string | null;
    /** a reference the text is about (!n, #n, SHA, path, URL) */
    readonly ref: string | null;
    /** the lane's label when the fact is one agent's */
    readonly agent: string | null;
    /** a quote (at most 120 characters) from the writer's input that the fact comes from; null for a fact imported from 1.x or added before anchors */
    readonly anchor: string | null;
    /** epoch ms */
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
