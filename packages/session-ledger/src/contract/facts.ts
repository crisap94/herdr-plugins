import type { Brand, Instant, ScopeId, Text } from './kernel.ts';

export interface HistoryFact {
    readonly section: Section;
    readonly text: Text;
    readonly why: Text | null;
    readonly state: 'open' | 'closed';
    readonly closedWhy: ClosedWhy | null;
    readonly closedAt: Instant | null;
    readonly firstAt: Instant;
    readonly lastAt: Instant;
}

export type FactId = Brand<string, 'FactId'>;
export type RunId = Brand<string, 'RunId'>;

export interface TaskId {
    readonly tab: ScopeId;
    readonly key: Text;
}

export type Section = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';
export type SectionId = Section;

export type ClosedWhy = 'done' | 'wrong' | 'superseded' | 'answered' | 'merged' | 'rewritten';

export interface Fact {
    readonly id: FactId;
    readonly task: TaskId;
    readonly section: Section;
    readonly text: Text;
    readonly why: Text | null;
    readonly ref: Text | null;
    readonly agent: Text | null;
    readonly anchor: Text | null;
    readonly firstAt: Instant;
    readonly lastAt: Instant;
    readonly state: 'open' | 'closed';
    readonly closedWhy: ClosedWhy | null;
    readonly closedAt: Instant | null;
    readonly language: Text;
}

export interface AddOp {
    readonly op: 'add';
    readonly section: Section;
    readonly text: Text;
    readonly why: Text | null;
    readonly ref: Text | null;
    readonly at: Instant | null;
    readonly agent: Text | null;
    readonly anchor?: Text | null;
}

export interface UpdateOp {
    readonly op: 'update';
    readonly id: FactId;
    readonly text: Text;
    readonly why: Text | null;
    readonly anchor?: Text | null;
}

export interface CloseOp {
    readonly op: 'close';
    readonly id: FactId;
    readonly why: ClosedWhy | null;
    readonly anchor?: Text;
}

export type Operation = AddOp | UpdateOp | CloseOp;

export interface TaskOps {
    readonly task: Text;
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
    readonly at: Instant;
    readonly language: Text;
    mint(): FactId;
}

export interface Applied {
    readonly changed: readonly Fact[];
    readonly refused: readonly Refusal[];
}
