import { brand } from '../brand.ts';
import { textOf } from '../text.ts';
import type { Finding, Gate } from './gate.ts';

export const unknownIdGate: Gate = {
    id: 'G6',
    check: (ops, context): readonly Finding[] => ops.flatMap((op, at) => (op.op !== 'add' && !context.shown.has(textOf(op.id))
        ? [{ at: brand<number, 'Count'>(at), gate: 'G6' as const, outcome: 'refuse' as const, reason: textOf(`${op.id} is not in the ledger`) }]
        : [])),
};
