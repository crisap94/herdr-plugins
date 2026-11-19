import type { HistoryFact } from '#src/ports/ledger.ts';
import { parseAnswerTally, type AnswerTally } from '#src/ports/autocompact-records.ts';
import { must } from '#src/protocol/result.ts';
import { correctionOf, factsOf } from './brief-coverage.ts';
import type { Coverage } from './brief-coverage.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import { parseCheckedFact, type CheckedFact, type CoverageOutcome } from '#src/recap/domain/autocompact.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { duration, type Duration } from '#src/recap/domain/time.ts';
import { parseUsd, type Usd } from '#src/recap/domain/usd.ts';

export interface Briefed {
    readonly text: Text | null;
    readonly why: Text | null;
    readonly own: Text;
}

export interface CoverageFlow {
    readonly atCeiling: Presence;
    readonly appends: Presence;
}

export interface Checked {
    readonly brief: Briefed;
    readonly coverage: AnswerTally | null;
    readonly outcome: CoverageOutcome;
    readonly coverageMs: Duration;
    readonly coverageCostUsd: Usd | null;
    readonly why: Text | null;
}

interface WaitingParts {
    readonly brief: Briefed;
    readonly why: Text;
    readonly outcome: CoverageOutcome;
    readonly coverage?: AnswerTally | null;
    readonly coverageMs?: Duration;
    readonly coverageCostUsd?: Usd | null;
}

const usdOrNull = (result: Coverage): Usd | null => result.costUsd === null || result.costUsd === undefined ? null : must(parseUsd(result.costUsd));

const tallyOf = (result: Coverage): AnswerTally | null => {
    const tally = parseAnswerTally(result.answers);
    return tally.kind === 'ok' ? tally.value : null;
};

const waiting = (parts: WaitingParts): Checked => ({
    brief: parts.brief, coverage: parts.coverage ?? null, outcome: parts.outcome, why: parts.why, coverageMs: parts.coverageMs ?? duration(0), coverageCostUsd: parts.coverageCostUsd ?? null,
});

type CoverageCheck = Pick<NonNullable<ReturnType<CompactionDeps['coverage']>>, 'check'>;

interface BestParts {
    readonly coverage: CoverageCheck;
    readonly first: Briefed;
    readonly facts: ReturnType<typeof factsOf>;
    readonly rewrite: (correction: Text) => Promise<Briefed>;
    readonly log: (line: Text) => void;
    readonly flow: CoverageFlow;
}

interface Best {
    readonly brief: Briefed;
    readonly result: Coverage;
}

async function bestBrief(parts: BestParts): Promise<Best> {
    const { coverage, first, facts, rewrite, log, flow } = parts;
    let brief = first;
    let result = await coverage.check(first.text ?? '', facts);
    if (!result.ok && result.unknown === null) {
        log(must(parseText(`autocompact: the brief misses ${result.missingFacts.length} fact(s); written again`)));
        const again = await rewrite(must(parseText(correctionOf(result.missing))));
        if (again.text !== null) {
            const rewritten = await coverage.check(again.text, facts);
            const costUsd = (result.costUsd ?? 0) + (rewritten.costUsd ?? 0);
            const keepRewrite = flow.appends === 'absent' || (rewritten.unknown === null && rewritten.missingFacts.length <= result.missingFacts.length);
            [brief, result] = keepRewrite ? [again, { ...rewritten, costUsd }] : [brief, { ...result, costUsd }];
        }
    }
    return { brief, result };
}

export async function checkedBrief(deps: Pick<CompactionDeps, 'coverage' | 'log' | 'now'>, first: Briefed, history: readonly HistoryFact[], rewrite: (correction: Text) => Promise<Briefed>, flow: CoverageFlow): Promise<Checked> {
    const started = deps.now();
    const coverage = deps.coverage();
    if (coverage === null) return waiting({ brief: first, why: must(parseText('no decider is set up')), outcome: { kind: 'unchecked', reason: 'no-decider' } });
    if (first.text === null) return waiting({ brief: first, why: first.why ?? must(parseText('the template would be used')), outcome: { kind: 'unchecked', reason: 'no-brief' } });
    const facts = factsOf(history);
    const { brief, result } = await bestBrief({ coverage, first, facts, rewrite, log: deps.log, flow });
    if (result.unknown !== null) return waiting({ brief, why: must(parseText(`brief not checked (${result.unknown})`)), outcome: { kind: 'unchecked', reason: 'decider-cannot-answer' }, coverageMs: duration(deps.now() - started), coverageCostUsd: usdOrNull(result) });
    if (!result.ok) {
        const missed = result.missingFacts.flatMap(({ fact }) => { const checked = parseCheckedFact(fact); return checked === null ? [] : [checked]; });
        return waiting({ brief, why: must(parseText(`the brief still misses ${missed.length} fact(s)`)), outcome: { kind: 'missed', facts: missed }, coverage: tallyOf(result), coverageMs: duration(deps.now() - started), coverageCostUsd: usdOrNull(result) });
    }
    return { brief, coverage: tallyOf(result), outcome: { kind: 'passed' }, coverageMs: duration(deps.now() - started), coverageCostUsd: usdOrNull(result), why: null };
}

const APPEND_ORDER: readonly CheckedFact['section'][] = ['goal', 'rules', 'needs', 'decisions'];

const oneLine = (text: Text): Text => must(parseText(text.replace(/\s+/gu, ' ').trim()));

export interface AppendedBrief {
    readonly text: Text;
    readonly indexes: readonly Count[];
}

export function appendedBrief(text: Text, facts: readonly CheckedFact[], checkedFacts: readonly CheckedFact[]): AppendedBrief {
    const ordered = [...facts.filter((fact) => !APPEND_ORDER.includes(fact.section)), ...APPEND_ORDER.flatMap((section) => facts.filter((fact) => fact.section === section))];
    const items = ordered.map((fact): Text => must(parseText(`${fact.section}: ${oneLine(fact.text)}${fact.section === 'decisions' && fact.why !== null ? ` — ${oneLine(fact.why)}` : ''}`)));
    const lead = /[.?!]$/u.test(text) ? '' : '.';
    const render = (shown: Count): Text => must(parseText(`${lead} Facts not carried into the brief (${facts.length} missed; ${items.length - shown} left out): ${items.slice(0, shown).map((item, at): Text => must(parseText(`(${at + 1}) ${item}`))).join('; ')}`.trimEnd()));
    let shown: Count = must(parseCount(items.length));
    while (render(shown).length > 1500 && shown > 0) {
        shown = must(parseCount(shown - 1));
    }
    const indexes = ordered.slice(0, shown).flatMap((fact) => {
        const at = checkedFacts.findIndex((candidate) => candidate.section === fact.section && candidate.text === fact.text && candidate.why === fact.why);
        return at >= 0 ? [must(parseCount(at))] : [];
    });
    return { text: must(parseText(`${text}${render(shown)}`)), indexes };
}
