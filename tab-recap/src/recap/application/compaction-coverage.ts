import type { HistoryFact } from '#src/ports/ledger.ts';
import { correctionOf, factsOf } from './brief-coverage.ts';
import type { CompactionDeps } from './compaction-deps.ts';

export interface Briefed {
    readonly text: string | null;
    readonly why: string | null;
    readonly own: string;
}

export interface Checked {
    readonly brief: Briefed;
    readonly coverage: Readonly<Record<string, number>> | null;
    readonly waited: boolean;
    readonly why: string | null;
}

const waiting = (brief: Briefed, why: string, coverage: Readonly<Record<string, number>> | null = null): Checked => ({ brief, coverage, waited: true, why });

export async function checkedBrief(deps: Pick<CompactionDeps, 'coverage' | 'log'>, first: Briefed, history: readonly HistoryFact[], rewrite: (correction: string) => Promise<Briefed>): Promise<Checked> {
    const coverage = deps.coverage();
    if (coverage === null) return waiting(first, 'no decider is set up');
    if (first.text === null) return waiting(first, first.why ?? 'the template would be used');
    const facts = factsOf(history);
    let [brief, result] = [first, await coverage.check(first.text, facts)];
    if (!result.ok && result.unknown === null) {
        deps.log(`autocompact: the brief misses ${result.missing.length} fact(s); written again`);
        const again = await rewrite(correctionOf(result.missing));
        if (again.text !== null) [brief, result] = [again, await coverage.check(again.text, facts)];
    }
    if (result.unknown !== null) return waiting(brief, `brief not checked (${result.unknown})`);
    if (!result.ok) return waiting(brief, `the brief still misses ${result.missing.length} fact(s)`, result.answers);
    return { brief, coverage: result.answers, waited: false, why: null };
}
