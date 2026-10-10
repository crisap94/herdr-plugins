import type { HistoryFact } from '#src/ports/ledger.ts';
import { correctionOf, factsOf } from './brief-coverage.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import type { CoverageOutcome } from '#src/recap/domain/autocompact.ts';
import { isSection } from '#src/recap/domain/fact.ts';

export interface Briefed {
    readonly text: string | null;
    readonly why: string | null;
    readonly own: string;
}

export interface Checked {
    readonly brief: Briefed;
    readonly coverage: Readonly<Record<string, number>> | null;
    readonly outcome: CoverageOutcome;
    readonly coverageMs: number;
    readonly coverageCostUsd: number | null;
    readonly why: string | null;
}

const waiting = (parts: { readonly brief: Briefed; readonly why: string; readonly outcome: CoverageOutcome; readonly coverage?: Readonly<Record<string, number>> | null; readonly coverageMs?: number; readonly coverageCostUsd?: number | null }): Checked => ({
    brief: parts.brief, coverage: parts.coverage ?? null, outcome: parts.outcome, why: parts.why, coverageMs: parts.coverageMs ?? 0, coverageCostUsd: parts.coverageCostUsd ?? null,
});

async function bestBrief(coverage: NonNullable<ReturnType<CompactionDeps['coverage']>>, first: Briefed, facts: ReturnType<typeof factsOf>, rewrite: (correction: string) => Promise<Briefed>, log: (line: string) => void): Promise<{ readonly brief: Briefed; readonly result: Awaited<ReturnType<typeof coverage.check>> }> {
    let brief = first;
    let result = await coverage.check(first.text ?? '', facts);
    if (!result.ok && result.unknown === null) {
        log(`autocompact: the brief misses ${result.missing.length} fact(s); written again`);
        const again = await rewrite(correctionOf(result.missing));
        if (again.text !== null) {
            const rewritten = await coverage.check(again.text, facts);
            const costUsd = (result.costUsd ?? 0) + (rewritten.costUsd ?? 0);
            if (rewritten.unknown === null && rewritten.missing.length <= result.missing.length) {
                brief = again;
                result = { ...rewritten, costUsd };
            } else {
                result = { ...result, costUsd };
            }
        }
    }
    return { brief, result };
}

export async function checkedBrief(deps: Pick<CompactionDeps, 'coverage' | 'log'>, first: Briefed, history: readonly HistoryFact[], rewrite: (correction: string) => Promise<Briefed>): Promise<Checked> {
    const started = Date.now();
    const coverage = deps.coverage();
    if (coverage === null) return waiting({ brief: first, why: 'no decider is set up', outcome: { kind: 'unchecked', reason: 'no-decider' } });
    if (first.text === null) return waiting({ brief: first, why: first.why ?? 'the template would be used', outcome: { kind: 'unchecked', reason: 'no-brief' } });
    const facts = factsOf(history);
    const { brief, result } = await bestBrief(coverage, first, facts, rewrite, deps.log);
    if (result.unknown !== null) return waiting({ brief, why: `brief not checked (${result.unknown})`, outcome: { kind: 'unchecked', reason: 'decider-cannot-answer' }, coverage: result.answers, coverageMs: Date.now() - started, coverageCostUsd: result.costUsd ?? null });
    if (!result.ok) {
        const missed = facts.filter((fact) => result.missing.some((missing) => missing === `${fact.section}: ${fact.text}` || (fact.section === 'decisions' && missing.startsWith(`the reason for the decision: ${fact.text}`)))).flatMap((fact) => isSection(fact.section) ? [{ section: fact.section, text: fact.text, why: fact.why }] : []);
        return waiting({ brief, why: `the brief still misses ${missed.length} fact(s)`, outcome: { kind: 'missed', facts: missed }, coverage: result.answers, coverageMs: Date.now() - started, coverageCostUsd: result.costUsd ?? null });
    }
    return { brief, coverage: result.answers, outcome: { kind: 'passed' }, coverageMs: Date.now() - started, coverageCostUsd: result.costUsd ?? null, why: null };
}
