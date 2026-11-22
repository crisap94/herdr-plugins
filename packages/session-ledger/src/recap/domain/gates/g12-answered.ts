import { brand } from '../brand.ts';
import { textOf } from '../text.ts';
import type { Finding, Gate } from './gate.ts';

export const answeredGate: Gate = {
    id: 'G12',
    check: (ops, context): readonly Finding[] => ops.flatMap((op, at) => {
        if (op.op !== 'close' || op.why !== 'answered') {
            return [];
        }
        const target = context.shown.get(textOf(op.id));
        return target === undefined || target.section === 'needs'
            ? []
            : [{ at: brand<number, 'Count'>(at), gate: 'G12' as const, outcome: 'refuse' as const, reason: textOf(`${op.id} is a ${target.section} fact, not a question: close it as done, wrong or superseded (answered fits only what is waiting on the operator)`) }];
    }),
};
