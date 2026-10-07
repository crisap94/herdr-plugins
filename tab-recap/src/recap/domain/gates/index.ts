// The gates, in the order they are run. G6 and G7 are not here: G7 (length) is the clip in `recap-shape.ts`, G6 belongs to the ledger.
import { duplicate } from './duplicate.ts';
import type { Context, Gate, GateId, Item, Outcome } from './item-gate.ts';
import { wrongLanguage } from './language.ts';
import { unresolved } from './link.ts';
import { narrator } from './narrator.ts';
import { pronounOpener } from './pronoun.ts';
import { notSpecific } from './specific.ts';
import { withoutWhy } from './why.ts';

export type { Context, Gate, GateId, GatedSection, GateStats, Item, Outcome } from './item-gate.ts';
export { itemKey } from './item-gate.ts';

export const GATES: readonly Gate[] = [narrator, duplicate, withoutWhy, unresolved, wrongLanguage, notSpecific, pronounOpener];

/** Every gate's outcome for `item`, refusals first. */
export function outcomesOf(item: Item, context: Context): readonly Outcome[] {
    const found = GATES.flatMap((gate) => gate.check(item, context) ?? []);
    return found.toSorted((a, b) => Number(b.kind === 'refuse') - Number(a.kind === 'refuse'));
}

export const GATE_IDS: readonly GateId[] = GATES.map((gate) => gate.id);
