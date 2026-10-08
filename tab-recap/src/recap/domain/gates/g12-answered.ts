// G12 answered: a close with the reason `answered` fits a question (a "needs" fact) and nothing else. A decision, a rule or a result is done, wrong or superseded.
import type { Gate } from './gate.ts';

export const answeredGate: Gate = {
    id: 'G12',
    check: (ops, context) => ops.flatMap((op, at) => {
        if (op.op !== 'close' || op.why !== 'answered') {
            return [];
        }
        const target = context.shown.get(op.id);
        return target === undefined || target.section === 'needs'
            ? []
            : [{ at, gate: 'G12', outcome: 'refuse' as const, reason: `${op.id} is a ${target.section} fact, not a question: close it as done, wrong or superseded (answered fits only what is waiting on the operator)` }];
    }),
};
