import { parseProbability } from '#src/recap/domain/probability.ts';
import { probabilityRequired, type CheckedCoverage, type MissingPart } from '#src/recap/application/brief-coverage.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { usdOf } from '#src/recap/domain/usd.ts';
import type { Section } from '#src/recap/domain/fact.ts';

export interface PlainCoverage {
    readonly ok: boolean;
    readonly missing: readonly string[];
    readonly missingFacts: readonly { readonly index: number; readonly fact: { readonly section: Section; readonly text: string; readonly why: string | null }; readonly parts: readonly MissingPart[] }[];
    readonly answers: Readonly<Record<string, number>>;
    readonly unknown: string | null;
    readonly costUsd?: number | null;
}

export const checkedOf = (plain: PlainCoverage): CheckedCoverage => ({
    complete: plain.ok ? 'present' : 'absent',
    missing: plain.missing.map((line) => textOf(line)),
    missingFacts: plain.missingFacts.map(({ index, fact, parts }) => ({ index: countOf(index), fact: { section: fact.section, text: textOf(fact.text), why: fact.why === null ? null : textOf(fact.why) }, parts })),
    answers: new Map(Object.entries(plain.answers).map(([key, value]) => [textOf(key), probabilityRequired(parseProbability(value))] as const)),
    unknown: plain.unknown === null ? null : textOf(plain.unknown),
    ...(plain.costUsd === undefined ? {} : { costUsd: plain.costUsd === null ? null : usdOf(plain.costUsd) }),
});
