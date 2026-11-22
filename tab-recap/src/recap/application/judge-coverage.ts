import type { RunItem } from '#src/ports/run-inputs.ts';
import type { Verdict } from '#src/ports/verdicts.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export interface Share {
    readonly passed: Count;
    readonly total: Count;
}

export type Row = Pick<Verdict, 'item' | 'check' | 'pass' | 'critique'>;

interface AddedShares {
    readonly coverage: Share;
    readonly filler: Share;
}

export interface Measured {
    readonly rows: readonly Row[];
    readonly coverage: Share;
    readonly filler: Share;
    readonly added: AddedShares;
}

export interface Carrying {
    readonly keyfacts: readonly Text[];
    readonly carried: ReadonlyMap<Count, Text | null>;
}

export function measureState(state: readonly RunItem[], carrying: Carrying): Measured {
    const tied = new Set([...carrying.carried.values()].flatMap((key) => key ?? []));
    const born = new Set(state.filter((item) => item.born).map((item) => item.key));
    const facts = carrying.keyfacts.map((fact, at): Row => ({ item: `keyfact/${at}`, check: 'coverage', pass: (carrying.carried.get(must(parseCount(at))) ?? null) !== null, critique: fact }));
    const lines = state.map((item): Row => ({ item: item.key, check: 'filler', pass: tied.has(must(parseText(item.key))), critique: tied.has(must(parseText(item.key))) ? null : 'not tied to a key fact' }));
    const bornLines = state.filter((item) => item.born);
    const bornFacts = carrying.keyfacts.filter((_, at) => born.has(carrying.carried.get(must(parseCount(at))) ?? ''));
    return {
        rows: [...facts, ...lines],
        coverage: { passed: must(parseCount(facts.filter((fact) => fact.pass).length)), total: must(parseCount(facts.length)) },
        filler: { passed: must(parseCount(lines.filter((line) => line.pass).length)), total: must(parseCount(lines.length)) },
        added: {
            coverage: { passed: must(parseCount(bornFacts.length)), total: must(parseCount(carrying.keyfacts.length)) },
            filler: { passed: must(parseCount(bornLines.filter((item) => tied.has(must(parseText(item.key)))).length)), total: must(parseCount(bornLines.length)) },
        },
    };
}

export const plus = (a: Share, b: Share): Share => ({ passed: must(parseCount(a.passed + b.passed)), total: must(parseCount(a.total + b.total)) });
