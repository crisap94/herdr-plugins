// What the judge measures over the ledger's state after a run: which key facts its open facts carry, which of them tie to a key fact,
// and the same two numbers for the facts the run added (a view of the same answer). Pure.
import type { RunItem } from '#src/ports/run-inputs.ts';
import type { Verdict } from '#src/ports/verdicts.ts';

/** `passed` of `total`: key facts the recap carries, or items tied to a key fact. */
export interface Share {
    readonly passed: number;
    readonly total: number;
}

export type Row = Pick<Verdict, 'item' | 'check' | 'pass' | 'critique'>;

export interface Measured {
    /** one row per key fact (coverage) and per state item (filler) */
    readonly rows: readonly Row[];
    readonly coverage: Share;
    readonly filler: Share;
    /** the same numbers over the facts the run created */
    readonly added: { readonly coverage: Share; readonly filler: Share };
}

/** The key facts and the state item that carries each (null: none does), by key fact index. */
export interface Carrying {
    readonly keyfacts: readonly string[];
    readonly carried: ReadonlyMap<number, string | null>;
}

/** Key facts as verdicts (one per fact: carried or not) and state items as verdicts (tied to a key fact, or filler). */
export function measureState(state: readonly RunItem[], carrying: Carrying): Measured {
    const tied = new Set([...carrying.carried.values()].flatMap((key) => key ?? []));
    const born = new Set(state.filter((item) => item.born).map((item) => item.key));
    const facts = carrying.keyfacts.map((fact, at): Row => ({ item: `keyfact/${at}`, check: 'coverage', pass: (carrying.carried.get(at) ?? null) !== null, critique: fact }));
    const lines = state.map((item): Row => ({ item: item.key, check: 'filler', pass: tied.has(item.key), critique: tied.has(item.key) ? null : 'not tied to a key fact' }));
    const bornLines = state.filter((item) => item.born);
    return {
        rows: [...facts, ...lines],
        coverage: { passed: facts.filter((fact) => fact.pass).length, total: facts.length },
        filler: { passed: lines.filter((line) => line.pass).length, total: lines.length },
        added: {
            coverage: { passed: carrying.keyfacts.filter((_, at) => born.has(carrying.carried.get(at) ?? '')).length, total: carrying.keyfacts.length },
            filler: { passed: bornLines.filter((item) => tied.has(item.key)).length, total: bornLines.length },
        },
    };
}

/** Both sums added: for the totals line of a report. */
export const plus = (a: Share, b: Share): Share => ({ passed: a.passed + b.passed, total: a.total + b.total });
