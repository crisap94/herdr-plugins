// G6 unknown id: an update or a close naming a fact the document did not show.
import type { Gate } from './gate.ts';

export const unknownIdGate: Gate = {
    id: 'G6',
    check: (ops, context) => ops.flatMap((op, at) => (op.op !== 'add' && !context.shown.has(op.id)
        ? [{ at, gate: 'G6', outcome: 'refuse' as const, reason: `${op.id} is not in the ledger` }]
        : [])),
};
