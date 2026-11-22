import type { AnswerTally } from '#src/ports/autocompact-records.ts';
import type { Decider, Noul } from '#src/ports/decider.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { must } from '#src/protocol/result.ts';
import { parseCheckedFact, type CheckedFact } from '#src/recap/domain/autocompact.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { checkCoverage, checkedFactsOf, correctionFor, KEPT_AT_LEAST, questionsOf, unmetLinesOf, unmetOf, type CheckedCoverage, type MissingPart, type UnmetFact } from './brief-coverage.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';
import type { ImportedChapter } from '#src/ports/imported-recaps.ts';
import { compareChapters, type Comparison, type TypedCompareDeps } from './compare-imported.ts';

export interface CoverageFact {
    readonly section: string;
    readonly text: string;
    readonly why: string | null;
}

export interface MissingFact {
    readonly index: number;
    readonly fact: CoverageFact;
    readonly parts: readonly MissingPart[];
}

export interface Coverage {
    readonly ok: boolean;
    readonly missing: readonly string[];
    readonly missingFacts: readonly MissingFact[];
    readonly answers: Readonly<Record<string, number>>;
    readonly unknown: string | null;
    readonly costUsd?: number | null;
}

const probabilityOf = (raw: number): Probability => {
    const found = parseProbability(raw);
    if (found === null) throw new RangeError(`not a probability: ${raw}`);
    return found;
};

const typedFacts = (facts: readonly CoverageFact[]): CheckedFact[] => facts.flatMap((fact) => {
    const checked = parseCheckedFact(fact);
    return checked === null ? [] : [checked];
});

const typedAnswers = (answers: Readonly<Record<string, number>>): AnswerTally => new Map(Object.entries(answers).map(([key, value]) => [must(parseText(key)), probabilityOf(value)] as const));

const typedUnmet = (missing: readonly MissingFact[]): UnmetFact[] => missing.flatMap(({ index, fact, parts }) => {
    const checked = parseCheckedFact(fact);
    return checked === null ? [] : [{ index: must(parseCount(index)), fact: checked, parts }];
});

const legacyCoverage = (result: CheckedCoverage): Coverage => ({
    ok: result.complete === 'present',
    missing: result.missing,
    missingFacts: result.missingFacts,
    answers: Object.fromEntries(result.answers),
    unknown: result.unknown,
    ...(result.costUsd === undefined ? {} : { costUsd: result.costUsd }),
});

export const factsOf = (history: readonly HistoryFact[]): readonly CoverageFact[] => checkedFactsOf(history);

export const questionsFor = (facts: readonly CoverageFact[]): ReadonlyMap<Text, Noul> => questionsOf(typedFacts(facts));

export const missingOf = (answers: Readonly<Record<string, number>>, facts: readonly CoverageFact[], keptAtLeast: number = KEPT_AT_LEAST): readonly MissingFact[] =>
    unmetOf(typedAnswers(answers), typedFacts(facts), probabilityOf(keptAtLeast));

export const linesOf = (missing: readonly MissingFact[]): readonly string[] => unmetLinesOf(typedUnmet(missing));

export const correctionOf = (missing: readonly string[]): string => correctionFor(missing.map((line) => must(parseText(line))));

export const covered = (brief: string, facts: readonly CoverageFact[], decider: Decider, keptAtLeast: number = KEPT_AT_LEAST): Promise<Coverage> =>
    checkCoverage(must(parseText(brief)), typedFacts(facts), decider, probabilityOf(keptAtLeast)).then(legacyCoverage);

export interface CompareDeps extends Omit<TypedCompareDeps, 'label'> { readonly label: string }

export function compareImported(deps: CompareDeps, chapters: readonly ImportedChapter[]): Promise<Comparison> {
    const typed = chapters.map((chapter) => ({ n: must(parseCount(chapter.n)), at: must(parseInstant(chapter.at)), items: chapter.items }));
    return compareChapters({ ...deps, label: must(parseTabId(deps.label)) }, typed);
}
