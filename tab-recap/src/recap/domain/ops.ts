// What the writer answers, and the pure fold that applies it: (ledger, operations, run) → (ledger, refusals).
import type { ClosedWhy, Fact, FactId, RunId, Section, TaskId } from './fact.ts';
import { sameTask } from './fact.ts';

export interface AddOp {
    readonly op: 'add';
    readonly section: Section;
    readonly text: string;
    readonly why: string | null;
    readonly ref: string | null;
    /** when the writer says it happened (epoch ms, already resolved); null: the run's time */
    readonly at: number | null;
    readonly agent: string | null;
}

export interface UpdateOp {
    readonly op: 'update';
    readonly id: string;
    readonly text: string;
    readonly why: string | null;
}

export interface CloseOp {
    readonly op: 'close';
    readonly id: string;
    /** null: the writer gave none or one it may not give (refused) */
    readonly why: ClosedWhy | null;
}

export type Operation = AddOp | UpdateOp | CloseOp;

/** The operations of one answer that are for one task of the tab (`task` is the task's key within the tab). */
export interface TaskOps {
    readonly task: string;
    readonly ops: readonly Operation[];
}

export type Reason = 'unknown-id' | 'closed' | 'no-why' | 'second-goal';

export interface Refusal {
    readonly op: Operation;
    readonly reason: Reason;
}

/** The run an answer belongs to: who made the facts, when, and in which language. `mint` hands out the ids of new facts. */
export interface RunRef {
    readonly id: RunId;
    readonly task: TaskId;
    readonly at: number;
    readonly language: string;
    mint(): FactId;
}

export interface Folded {
    readonly ledger: readonly Fact[];
    readonly refused: readonly Refusal[];
    /** the facts this answer created or changed */
    readonly changed: readonly Fact[];
}

const closedBy = (fact: Fact, why: ClosedWhy, at: number): Fact => ({ ...fact, state: 'closed', closedWhy: why, closedAt: at, lastAt: Math.max(fact.lastAt, at) });

function closeOne(facts: readonly Fact[], op: CloseOp, run: RunRef): { facts: readonly Fact[]; refusal: Refusal | null } {
    const target = facts.find((fact) => fact.id === op.id);
    if (target === undefined) {
        return { facts, refusal: { op, reason: 'unknown-id' } };
    }
    if (target.state === 'closed') {
        return { facts, refusal: { op, reason: 'closed' } };
    }
    if (op.why === null) {
        return { facts, refusal: { op, reason: 'no-why' } };
    }
    const why = op.why;
    return { facts: facts.map((fact) => (fact === target ? closedBy(fact, why, run.at) : fact)), refusal: null };
}

function updateOne(facts: readonly Fact[], op: UpdateOp, run: RunRef): { facts: readonly Fact[]; refusal: Refusal | null } {
    const target = facts.find((fact) => fact.id === op.id);
    if (target === undefined) {
        return { facts, refusal: { op, reason: 'unknown-id' } };
    }
    if (target.state === 'closed') {
        return { facts, refusal: { op, reason: 'closed' } };
    }
    const why = op.why ?? target.why;
    if (target.section === 'decisions' && why === null) {
        return { facts, refusal: { op, reason: 'no-why' } };
    }
    return { facts: facts.map((fact) => (fact === target ? { ...fact, text: op.text, why, lastAt: Math.max(fact.lastAt, run.at), language: run.language } : fact)), refusal: null };
}

function addOne(facts: readonly Fact[], op: AddOp, run: RunRef): { facts: readonly Fact[]; refusal: Refusal | null } {
    if (op.section === 'decisions' && op.why === null) {
        return { facts, refusal: { op, reason: 'no-why' } };
    }
    const first = Math.min(op.at ?? run.at, run.at);
    const fact: Fact = {
        id: run.mint(), task: run.task, section: op.section, text: op.text, why: op.why, ref: op.ref, agent: op.agent,
        firstAt: first, lastAt: run.at, state: 'open', closedWhy: null, closedAt: null, language: run.language,
    };
    const replaced = op.section === 'goal' ? facts.map((each) => (each.section === 'goal' && each.state === 'open' && sameTask(each.task, run.task) ? closedBy(each, 'superseded', run.at) : each)) : facts;
    return { facts: [...replaced, fact], refusal: null };
}

/**
 * Closes first, then updates, then adds (so a close and an add of the same line never read as a duplicate). A second `goal` add in one
 * answer is refused; an add of a goal closes the open one as `superseded`.
 */
export function apply(ledger: readonly Fact[], ops: readonly Operation[], run: RunRef): Folded {
    let facts = ledger;
    const refused: Refusal[] = [];
    let goals = 0;
    const step = (result: { facts: readonly Fact[]; refusal: Refusal | null }): void => {
        facts = result.facts;
        if (result.refusal !== null) {
            refused.push(result.refusal);
        }
    };
    for (const op of ops.filter((each) => each.op === 'close')) {
        step(closeOne(facts, op, run));
    }
    for (const op of ops.filter((each) => each.op === 'update')) {
        step(updateOne(facts, op, run));
    }
    for (const op of ops.filter((each) => each.op === 'add')) {
        goals += op.section === 'goal' ? 1 : 0;
        step(op.section === 'goal' && goals > 1 ? { facts, refusal: { op, reason: 'second-goal' } } : addOne(facts, op, run));
    }
    return { ledger: facts, refused, changed: facts.filter((fact, at) => ledger[at] !== fact) };
}
