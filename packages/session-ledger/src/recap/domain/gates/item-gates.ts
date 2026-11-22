import type { Count } from '#src/contract/kernel.ts';
import { brand } from '../brand.ts';
import type { Fact } from '../fact.ts';
import type { Operation } from '../ops.ts';
import { textOf, type Text } from '../text.ts';
import type { Finding, Gate, GateContext } from './gate.ts';
import { GATES } from './index.ts';
import type { Item } from './index.ts';

const withWhy = (section: Item['section'], text: Text, why: Text | null): Text => (section === 'decisions' && why !== null ? textOf(`${text} — ${why}`) : text);

export function itemOf(op: Operation, at: Count, shown: ReadonlyMap<Text, Fact>): Item | null {
    if (op.op === 'close') {
        return null;
    }
    const was = op.op === 'update' ? shown.get(textOf(op.id)) : undefined;
    const section = op.op === 'add' ? op.section : was?.section;
    const why = op.why ?? was?.why ?? null;
    return section === undefined ? null : { task: textOf(''), section, position: at, text: withWhy(section, textOf(op.text), why === null ? null : textOf(why)) };
}

export const itemGate: Gate = {
    id: 'ITEM',
    check: (ops: readonly Operation[], context: GateContext): readonly Finding[] => {
        const earlier: Item[] = [];
        const found: Finding[] = [];
        ops.forEach((op, at) => {
            const item = itemOf(op, brand<number, 'Count'>(at), context.shown);
            if (item === null) {
                return;
            }
            const outcomes = GATES.filter((gate) => gate.id !== 'G2').flatMap((gate) => gate.check(item, { language: context.language, agents: context.agents, earlier }) ?? []);
            const refusal = outcomes.find((outcome) => outcome.kind === 'refuse');
            const reported = refusal === undefined ? outcomes : [refusal];
            found.push(...reported.map((outcome) => ({ at: item.position, gate: outcome.gate, outcome: outcome.kind, reason: outcome.reason })));
            if (refusal === undefined) {
                earlier.push(item);
            }
        });
        return found;
    },
};
