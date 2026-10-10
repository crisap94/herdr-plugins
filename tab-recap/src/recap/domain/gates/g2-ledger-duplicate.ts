import type { AddOp, Operation } from '../ops.ts';
import { docIdOf } from './gate.ts';
import type { Finding, Gate, GateContext } from './gate.ts';
import { jaccard } from './jaccard.ts';

export const OPEN_ALIKE = 0.6;
export const CLOSED_ALIKE = 0.8;
const HOUR = 3_600_000;


function against(op: AddOp, at: number, ops: readonly Operation[], context: GateContext): Finding | null {
    const closing = new Set(ops.flatMap((each) => (each.op === 'close' ? [context.shown.get(each.id)?.id] : [])));
    const open = [...context.shown.values()].filter((fact) => fact.state === 'open' && !closing.has(fact.id));
    const twin = open.find((fact) => jaccard(fact.text, op.text) >= OPEN_ALIKE);
    if (twin !== undefined) {
        return { at, gate: 'G2', outcome: 'refuse', reason: `it repeats ${docIdOf(twin, context.shown) ?? 'an open fact'} ("${twin.text}"): update ${docIdOf(twin, context.shown) ?? 'it'} instead of adding it` };
    }
    const shut = context.closedLately.find((fact) => !closing.has(fact.id) && jaccard(fact.text, op.text) >= CLOSED_ALIKE);
    if (shut !== undefined) {
        const hours = Math.max(0, Math.round((context.now - (shut.closedAt ?? context.now)) / HOUR));
        return { at, gate: 'G2', outcome: 'refuse', reason: `it repeats a fact closed ${hours} h ago as ${shut.closedWhy ?? 'closed'} ("${shut.text}")` };
    }
    const earlier = ops.slice(0, at).findIndex((each) => each.op === 'add' && jaccard(each.text, op.text) >= OPEN_ALIKE);
    return earlier < 0 ? null : { at, gate: 'G2', outcome: 'refuse', reason: 'it repeats another fact added in this answer' };
}

export const duplicateGate: Gate = {
    id: 'G2',
    check: (ops, context) => ops.flatMap((op, at) => {
        const found = op.op === 'add' ? against(op, at, ops, context) : null;
        return found === null ? [] : [found];
    }),
};

