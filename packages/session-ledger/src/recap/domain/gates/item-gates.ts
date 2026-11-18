import type { Operation } from '../ops.ts';
import type { Finding, Gate, GateContext } from './gate.ts';
import { GATES } from './index.ts';
import type { Item } from './index.ts';
import { itemOf } from './legacy.ts';

export const itemGate: Gate = {
    id: 'ITEM',
    check: (ops: readonly Operation[], context: GateContext): readonly Finding[] => {
        const earlier: Item[] = [];
        const found: Finding[] = [];
        ops.forEach((op, at) => {
            const item = itemOf(op, at, context.shown);
            if (item === null) {
                return;
            }
            const outcomes = GATES.filter((gate) => gate.id !== 'G2').flatMap((gate) => gate.check(item, { language: context.language, agents: context.agents, earlier }) ?? []);
            const refusal = outcomes.find((outcome) => outcome.kind === 'refuse');
            const reported = refusal === undefined ? outcomes : [refusal];
            found.push(...reported.map((outcome) => ({ at, gate: outcome.gate, outcome: outcome.kind, reason: outcome.reason })));
            if (refusal === undefined) {
                earlier.push(item);
            }
        });
        return found;
    },
};
