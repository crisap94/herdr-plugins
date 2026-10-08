// A gate looks at the operations of one answer for one task and says which to refuse or flag. Pure; no model.
import type { Fact } from '../fact.ts';
import type { Operation } from '../ops.ts';

export interface GateContext {
    readonly now: number;
    /** the language the recap is written in (the item gates answer in it) */
    readonly language: string;
    /** labels, kinds and ids (`a1`) of the tab's agents, lower-cased */
    readonly agents: readonly string[];
    /** the task's ledger as the document showed it: document id (`f4`) → fact */
    readonly shown: ReadonlyMap<string, Fact>;
    /** the task's facts closed in the last day, whether the document showed them or not */
    readonly closedLately: readonly Fact[];
    /** what an anchor is looked for in: the turns, tool calls and agent notes of the input, words folded by `foldedOf` */
    readonly source: string;
}

export interface Finding {
    /** the index of the operation in the answer */
    readonly at: number;
    readonly gate: string;
    readonly outcome: 'refuse' | 'flag';
    readonly reason: string;
}

export interface Gate {
    /** `G2` */
    readonly id: string;
    check(ops: readonly Operation[], context: GateContext): readonly Finding[];
}

/** The document id a fact was shown with, when it was shown. */
export function docIdOf(fact: Fact, shown: ReadonlyMap<string, Fact>): string | null {
    return [...shown].find(([, each]) => each.id === fact.id)?.[0] ?? null;
}
