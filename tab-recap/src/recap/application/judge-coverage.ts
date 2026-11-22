import type { RunItem } from '#src/ports/run-inputs.ts';
import type { VerdictRecord } from '#src/ports/verdicts.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';

export interface Share {
    readonly passed: Count;
    readonly total: Count;
}

export type Row = Pick<VerdictRecord, 'item' | 'check' | 'pass' | 'critique'>;

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
    const facts = carrying.keyfacts.map((fact, at): Row => ({ item: textOf(`keyfact/${at}`), check: textOf('coverage'), pass: (carrying.carried.get(must(parseCount(at))) ?? null) !== null ? 'pass' : 'fail', critique: fact }));
    const lines = state.map((item): Row => ({ item: textOf(item.key), check: textOf('filler'), pass: tied.has(must(parseText(item.key))) ? 'pass' : 'fail', critique: tied.has(must(parseText(item.key))) ? null : textOf('not tied to a key fact') }));
    const bornLines = state.filter((item) => item.born);
    const bornFacts = carrying.keyfacts.filter((_, at) => born.has(carrying.carried.get(must(parseCount(at))) ?? ''));
    return {
        rows: [...facts, ...lines],
        coverage: { passed: must(parseCount(facts.filter((fact) => fact.pass === 'pass').length)), total: must(parseCount(facts.length)) },
        filler: { passed: must(parseCount(lines.filter((line) => line.pass === 'pass').length)), total: must(parseCount(lines.length)) },
        added: {
            coverage: { passed: must(parseCount(bornFacts.length)), total: must(parseCount(carrying.keyfacts.length)) },
            filler: { passed: must(parseCount(bornLines.filter((item) => tied.has(must(parseText(item.key)))).length)), total: must(parseCount(bornLines.length)) },
        },
    };
}

export const plus = (a: Share, b: Share): Share => ({ passed: must(parseCount(a.passed + b.passed)), total: must(parseCount(a.total + b.total)) });
