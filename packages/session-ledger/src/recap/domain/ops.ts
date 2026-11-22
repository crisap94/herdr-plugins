import { brand, type Brand } from './brand.ts';
import { sameTask, type ClosedWhy, type Fact, type FactId, type RunId, type Section, type TaskId } from './fact.ts';
import type { Text } from './text.ts';
import { instant, type Instant } from './time.ts';

export interface AddOp { readonly op: 'add'; readonly section: Section; readonly text: Text; readonly why: Text | null; readonly ref: Text | null; readonly at: Instant | null; readonly agent: Text | null; readonly anchor?: Text | null; }

export interface UpdateOp { readonly op: 'update'; readonly id: FactId; readonly text: Text; readonly why: Text | null; readonly anchor?: Text | null; }

export interface CloseOp { readonly op: 'close'; readonly id: FactId; readonly why: ClosedWhy | null; readonly anchor?: Text; }

export type Operation = AddOp | UpdateOp | CloseOp;

export interface TaskOps { readonly task: Text; readonly ops: readonly Operation[]; }

export interface RunRef { readonly id: RunId; readonly task: TaskId; readonly at: Instant; readonly language: Text; mint(): FactId; }

export type Reason = 'unknown-id' | 'closed' | 'no-why' | 'second-goal';

export interface Refusal {
    readonly op: Operation;
    readonly reason: Reason;
}

export interface Folded {
    readonly ledger: readonly Fact[];
    readonly refused: readonly Refusal[];
    readonly changed: readonly Fact[];
}

interface Stepped {
    readonly facts: readonly Fact[];
    readonly refusal: Refusal | null;
}

const closedBy = (fact: Fact, why: ClosedWhy, run: Omit<RunRef, 'id'>): Fact => ({ ...fact, state: 'closed', closedWhy: why, closedAt: run.at, lastAt: instant(Math.max(fact.lastAt, run.at)) });

function closeOne(facts: readonly Fact[], op: CloseOp, run: Omit<RunRef, 'id'>): Stepped {
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
    return { facts: facts.map((fact) => (fact === target ? closedBy(fact, why, run) : fact)), refusal: null };
}

function updateOne(facts: readonly Fact[], op: UpdateOp, run: Omit<RunRef, 'id'>): Stepped {
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
    return { facts: facts.map((fact) => (fact === target ? { ...fact, text: op.text, why, anchor: op.anchor ?? fact.anchor, lastAt: instant(Math.max(fact.lastAt, run.at)), language: run.language } : fact)), refusal: null };
}

function addOne(facts: readonly Fact[], op: AddOp, run: Omit<RunRef, 'id'>): Stepped {
    if (op.section === 'decisions' && op.why === null) {
        return { facts, refusal: { op, reason: 'no-why' } };
    }
    const first = instant(Math.min(op.at ?? run.at, run.at));
    const fact: Fact = {
        id: run.mint(), task: run.task, section: op.section, text: op.text, why: op.why, ref: op.ref, agent: op.agent, anchor: op.anchor ?? null,
        firstAt: first, lastAt: run.at, state: 'open', closedWhy: null, closedAt: null, language: run.language,
    };
    const replaced = op.section === 'goal' ? facts.map((each) => (each.section === 'goal' && each.state === 'open' && sameTask(each.task, run.task) ? closedBy(each, 'superseded', run) : each)) : facts;
    return { facts: [...replaced, fact], refusal: null };
}

function stepped(ledger: readonly Fact[], ops: readonly Operation[], run: Omit<RunRef, 'id'>): Folded {
    let facts = ledger;
    const refused: Refusal[] = [];
    let goals = 0;
    const step = (result: Stepped): void => {
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
    return { ledger: facts, refused, changed: [] };
}

function changedFrom(ledger: readonly Fact[], facts: readonly Fact[], refused: readonly Refusal[]): Folded {
    return { ledger: facts, refused, changed: facts.filter((fact, at) => ledger[at] !== fact) };
}

function supersedeNow(facts: readonly Fact[], ledger: readonly Fact[], ops: readonly Operation[], run: Omit<RunRef, 'id'>): readonly Fact[] {
    const named = new Set(ops.flatMap((op) => (op.op === 'add' ? [] : [op.id])));
    return facts.map((fact, at) => (at < ledger.length && fact.section === 'now' && fact.state === 'open' && !named.has(fact.id) ? closedBy(fact, 'superseded', run) : fact));
}

export function fold(ledger: readonly Fact[], ops: readonly Operation[], run: Omit<RunRef, 'id'>): Folded {
    const { ledger: facts, refused } = stepped(ledger, ops, run);
    return changedFrom(ledger, facts, refused);
}

export function foldSwept(ledger: readonly Fact[], ops: readonly Operation[], run: Omit<RunRef, 'id'>): Folded {
    const { ledger: facts, refused } = stepped(ledger, ops, run);
    return changedFrom(ledger, ops.length === 0 ? facts : supersedeNow(facts, ledger, ops, run), refused);
}

export type SweepNow = Brand<boolean, 'SweepNow'>;

export const sweepOf = brand<boolean, 'SweepNow'>;

export function apply(ledger: readonly Fact[], ops: readonly Operation[], run: RunRef, sweepNow: SweepNow = sweepOf(false)): Folded {
    return sweepNow ? foldSwept(ledger, ops, run) : fold(ledger, ops, run);
}
