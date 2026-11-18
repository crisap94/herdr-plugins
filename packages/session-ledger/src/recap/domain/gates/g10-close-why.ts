import type { Gate } from './gate.ts';

export const closeWhyGate: Gate = {
    id: 'G10',
    check: (ops) => ops.flatMap((op, at) => (op.op === 'close' && op.why === null
        ? [{ at, gate: 'G10', outcome: 'refuse' as const, reason: `closing ${op.id} needs a why: done, wrong, superseded or answered` }]
        : [])),
};
