// An automatic compaction checks its brief before anything is typed: a first check, one rewrite naming what is missing, a second check.
import type { HistoryFact } from '#src/ports/ledger.ts';
import { correctionOf, factsOf } from './brief-coverage.ts';
import type { CompactionDeps } from './compaction-deps.ts';

/** A brief as the flow carries it: the text (null: the template is used), why there is none, and the agent's own words. */
export interface Briefed {
    readonly text: string | null;
    readonly why: string | null;
    readonly own: string;
}

export interface Checked {
    readonly brief: Briefed;
    /** the answers of the last check; null when none ran */
    readonly coverage: Readonly<Record<string, number>> | null;
    /** the brief still misses a fact that matters (or could not be checked): an automatic compaction does not go ahead */
    readonly waited: boolean;
}

/** `rewrite` writes the brief again with a correction. A compaction with no check (the operator's, or no decider) passes through. */
export async function checkedBrief(deps: Pick<CompactionDeps, 'coverage' | 'log'>, first: Briefed, history: readonly HistoryFact[], rewrite: (correction: string) => Promise<Briefed>): Promise<Checked> {
    const coverage = deps.coverage();
    if (coverage === null || first.text === null) return { brief: first, coverage: null, waited: false };
    const facts = factsOf(history);
    let [brief, result] = [first, await coverage.check(first.text, facts)];
    if (!result.ok && result.unknown === null) {
        deps.log(`autocompact: the brief misses ${result.missing.length} fact(s); written again`);
        const again = await rewrite(correctionOf(result.missing));
        if (again.text !== null) [brief, result] = [again, await coverage.check(again.text, facts)];
    }
    if (result.unknown !== null) deps.log(`autocompact: brief not checked (${result.unknown})`);
    return { brief, coverage: result.answers, waited: !result.ok };
}
