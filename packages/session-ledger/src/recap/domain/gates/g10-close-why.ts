import { brand } from '../brand.ts';
import { textOf } from '../text.ts';
import type { Finding, Gate } from './gate.ts';

export const closeWhyGate: Gate = {
    id: 'G10',
    check: (ops): readonly Finding[] => ops.flatMap((op, at) => (op.op === 'close' && op.why === null
        ? [{ at: brand<number, 'Count'>(at), gate: 'G10' as const, outcome: 'refuse' as const, reason: textOf(`closing ${op.id} needs a why: done, wrong, superseded or answered`) }]
        : [])),
};
