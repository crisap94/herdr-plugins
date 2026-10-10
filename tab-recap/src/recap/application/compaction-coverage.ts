import type { HistoryFact } from '#src/ports/ledger.ts';
import { correctionOf, factsOf } from './brief-coverage.ts';
import type { Coverage } from './brief-coverage.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import type { CheckedFact, CoverageOutcome } from '#src/recap/domain/autocompact.ts';
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

async function bestBrief(parts: { readonly coverage: { check(brief: string, facts: ReturnType<typeof factsOf>): Promise<Coverage> }; readonly first: Briefed; readonly facts: ReturnType<typeof factsOf>; readonly rewrite: (correction: string) => Promise<Briefed>; readonly log: (line: string) => void; readonly ceiling: boolean }): Promise<{ readonly brief: Briefed; readonly result: Coverage }> {
    const { coverage, first, facts, rewrite, log, ceiling } = parts;
    let brief = first;
    let result = await coverage.check(first.text ?? '', facts);
    if (!result.ok && result.unknown === null) {
        log(`autocompact: the brief misses ${result.missingFacts.length} fact(s); written again`);
        const again = await rewrite(correctionOf(result.missing));
        if (again.text !== null) {
            const rewritten = await coverage.check(again.text, facts);
            const costUsd = (result.costUsd ?? 0) + (rewritten.costUsd ?? 0);
            const keepRewrite = !ceiling || (rewritten.unknown === null && rewritten.missingFacts.length <= result.missingFacts.length);
            [brief, result] = keepRewrite ? [again, { ...rewritten, costUsd }] : [brief, { ...result, costUsd }];
        }
    }
    return { brief, result };
}

export async function checkedBrief(deps: Pick<CompactionDeps, 'coverage' | 'log' | 'now'>, first: Briefed, history: readonly HistoryFact[], rewrite: (correction: string) => Promise<Briefed>, ceiling: boolean): Promise<Checked> {
    const started = deps.now();
    const coverage = deps.coverage();
    if (coverage === null) return waiting({ brief: first, why: 'no decider is set up', outcome: { kind: 'unchecked', reason: 'no-decider' } });
    if (first.text === null) return waiting({ brief: first, why: first.why ?? 'the template would be used', outcome: { kind: 'unchecked', reason: 'no-brief' } });
    const facts = factsOf(history);
    const { brief, result } = await bestBrief({ coverage, first, facts, rewrite, log: deps.log, ceiling });
    if (result.unknown !== null) return waiting({ brief, why: `brief not checked (${result.unknown})`, outcome: { kind: 'unchecked', reason: 'decider-cannot-answer' }, coverageMs: deps.now() - started, coverageCostUsd: result.costUsd ?? null });
    if (!result.ok) {
        const missed = result.missingFacts.flatMap(({ fact }) => isSection(fact.section) ? [{ section: fact.section, text: fact.text, why: fact.why }] : []);
        return waiting({ brief, why: `the brief still misses ${missed.length} fact(s)`, outcome: { kind: 'missed', facts: missed }, coverage: result.answers, coverageMs: deps.now() - started, coverageCostUsd: result.costUsd ?? null });
    }
    return { brief, coverage: result.answers, outcome: { kind: 'passed' }, coverageMs: deps.now() - started, coverageCostUsd: result.costUsd ?? null, why: null };
}

const APPEND_ORDER = ['goal', 'rules', 'needs', 'decisions'] as const;

const oneLine = (text: string): string => text.replace(/\s+/gu, ' ').trim();

export function appendedBrief(text: string, facts: Extract<Checked['outcome'], { readonly kind: 'missed' }>['facts'], checkedFacts: readonly CheckedFact[]): { readonly text: string; readonly indexes: readonly number[] } {
    const ordered = [...facts].toSorted((a, b) => APPEND_ORDER.indexOf(a.section as (typeof APPEND_ORDER)[number]) - APPEND_ORDER.indexOf(b.section as (typeof APPEND_ORDER)[number]));
    const items = ordered.map((fact) => `${fact.section}: ${oneLine(fact.text)}${fact.section === 'decisions' && fact.why !== null ? ` — ${oneLine(fact.why)}` : ''}`);
    const lead = /[.?!]$/u.test(text) ? '' : '.';
    const render = (shown: number): string => `${lead} Facts not carried into the brief (${facts.length} missed; ${items.length - shown} left out): ${items.slice(0, shown).map((item, at) => `(${at + 1}) ${item}`).join('; ')}`.trimEnd();
    let shown = items.length;
    while (render(shown).length > 1500 && shown > 0) {
        shown -= 1;
    }
    const indexes = items.slice(0, shown).map((_, at) => {
        const fact = ordered[at];
        return fact === undefined ? -1 : checkedFacts.findIndex((candidate) => candidate.section === fact.section && candidate.text === fact.text && candidate.why === fact.why);
    }).filter((at) => at >= 0);
    return { text: `${text}${render(shown)}`, indexes };
}
