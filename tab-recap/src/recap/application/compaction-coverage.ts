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
    /** the answers of the last check; null when none ran or the decider could not answer */
    readonly coverage: Readonly<Record<string, number>> | null;
    /** the brief cannot go ahead (it misses a fact, or could not be checked): an automatic compaction does not type it */
    readonly waited: boolean;
    /** why it waits, in words for the decision; null when it goes ahead */
    readonly why: string | null;
}

const waiting = (brief: Briefed, why: string, coverage: Readonly<Record<string, number>> | null = null): Checked => ({ brief, coverage, waited: true, why });

/** `rewrite` writes the brief again with a correction. An automatic compaction fails closed: no decider, the template, or a decider that cannot answer all wait. */
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
