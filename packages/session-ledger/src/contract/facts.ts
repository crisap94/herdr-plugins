import type { Brand } from './kernel.ts';

export interface HistoryFact {
    readonly section: string;
    readonly text: string;
    readonly why: string | null;
    readonly state: 'open' | 'closed';
    readonly closedWhy: string | null;
    readonly closedAt: number | null;
    readonly firstAt: number;
    readonly lastAt: number;
}

export type FactId = Brand<string, 'FactId'>;
export type RunId = Brand<string, 'RunId'>;

export interface TaskId {
    readonly tab: string;
    readonly key: string;
}

export type Section = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';
export type SectionId = Section;

export type ClosedWhy = 'done' | 'wrong' | 'superseded' | 'answered' | 'merged' | 'rewritten';

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

export interface AddOp {
    readonly op: 'add';
    readonly section: Section;
    readonly text: string;
    readonly why: string | null;
    readonly ref: string | null;
    readonly at: number | null;
    readonly agent: string | null;
    readonly anchor?: string | null;
}

export interface UpdateOp {
    readonly op: 'update';
    readonly id: string;
    readonly text: string;
    readonly why: string | null;
    readonly anchor?: string | null;
}

export interface CloseOp {
    readonly op: 'close';
    readonly id: string;
    readonly why: ClosedWhy | null;
}

export type Operation = AddOp | UpdateOp | CloseOp;

export interface TaskOps {
    readonly task: string;
    readonly ops: readonly Operation[];
}

export type Reason = 'unknown-id' | 'closed' | 'no-why' | 'second-goal';

export interface Refusal {
    readonly op: Operation;
    readonly reason: Reason;
}

export interface RunRef {
    readonly id: RunId;
    readonly task: TaskId;
    readonly at: number;
    readonly language: string;
    mint(): FactId;
}

export interface Applied {
    readonly changed: readonly Fact[];
    readonly refused: readonly Refusal[];
}
