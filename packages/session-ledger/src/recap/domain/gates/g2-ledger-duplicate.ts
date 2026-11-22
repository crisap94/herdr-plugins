import type { AddOp, Operation } from '../ops.ts';
import { brand } from '../brand.ts';
import { textOf } from '../text.ts';
import { docIdOf } from './gate.ts';
import type { Finding, Gate, GateContext } from './gate.ts';
import { jaccard } from './jaccard.ts';

export const OPEN_ALIKE = 0.6;
export const CLOSED_ALIKE = 0.8;
const HOUR = 3_600_000;

function against(op: AddOp, before: readonly Operation[], ops: readonly Operation[], context: GateContext): Finding | null {
    const at = brand<number, 'Count'>(before.length);
    const closing = new Set(ops.flatMap((each) => (each.op === 'close' ? [context.shown.get(textOf(each.id))?.id] : [])));
    const open = context.open.filter((fact) => fact.state === 'open' && !closing.has(fact.id));
    const twin = [...context.shown.values()].find((fact) => open.some((candidate) => candidate.id === fact.id) && jaccard(textOf(fact.text), textOf(op.text)) >= OPEN_ALIKE)
        ?? open.find((fact) => jaccard(textOf(fact.text), textOf(op.text)) >= OPEN_ALIKE);
    if (twin !== undefined) {
        const id = docIdOf(twin, context.shown);
        return { at, gate: 'G2', outcome: 'refuse', reason: textOf(id === null
            ? `it repeats a fact already recorded and hidden ("${twin.text}"): drop the add`
            : `it repeats ${id} ("${twin.text}"): update ${id} instead of adding it`) };
    }
    const shut = context.closedLately.find((fact) => !closing.has(fact.id) && jaccard(textOf(fact.text), textOf(op.text)) >= CLOSED_ALIKE);
    if (shut !== undefined) {
        const hours = Math.max(0, Math.round((context.now - (shut.closedAt ?? context.now)) / HOUR));
        return { at, gate: 'G2', outcome: 'refuse', reason: textOf(`it repeats a fact closed ${hours} h ago as ${shut.closedWhy ?? 'closed'} ("${shut.text}")`) };
    }
    const earlier = before.findIndex((each) => each.op === 'add' && jaccard(textOf(each.text), textOf(op.text)) >= OPEN_ALIKE);
    return earlier < 0 ? null : { at, gate: 'G2', outcome: 'refuse', reason: textOf('it repeats another fact added in this answer') };
}

export const duplicateGate: Gate = {
    id: 'G2',
    check: (ops, context) => ops.flatMap((op, at) => {
        const found = op.op === 'add' ? against(op, ops.slice(0, at), ops, context) : null;
        return found === null ? [] : [found];
    }),
};

