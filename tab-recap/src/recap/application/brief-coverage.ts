import type { AnswerTally } from '#src/ports/autocompact-records.ts';
import type { Decider, Noul } from '#src/ports/decider.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseCheckedFact, type CheckedFact } from '#src/recap/domain/autocompact.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { Section } from '@stateforge-labs/session-ledger/unstable/recap/domain/fact.ts';

export type { Coverage, CoverageFact, MissingFact } from './legacy.ts';
export { correctionOf, covered, factsOf, linesOf, missingOf, questionsFor } from './legacy.ts';

const COVERED: ReadonlySet<Section> = new Set<Section>(['goal', 'now', 'needs', 'decisions', 'next', 'rules']);
const BLOCKING: ReadonlySet<Section> = new Set<Section>(['goal', 'needs', 'decisions', 'rules']);
export const FACTS_CHECKED = 40;
export const KEPT_AT_LEAST = 0.70;

export type MissingPart = 'text' | 'reason';

export interface UnmetFact {
    readonly index: Count;
    readonly fact: CheckedFact;
    readonly parts: readonly MissingPart[];
}

export interface CheckedCoverage {
    readonly complete: Presence;
    readonly missing: readonly Text[];
    readonly missingFacts: readonly UnmetFact[];
    readonly answers: AnswerTally;
    readonly unknown: Text | null;
    readonly costUsd?: Usd | null;
}

export const checkedFactsOf = (history: readonly HistoryFact[]): readonly CheckedFact[] =>
    history.flatMap((fact) => {
        const checked = parseCheckedFact(fact);
        return fact.state === 'open' && checked !== null && COVERED.has(checked.section) ? [checked] : [];
    }).slice(0, FACTS_CHECKED);

export function questionsOf(facts: readonly CheckedFact[]): ReadonlyMap<Text, Noul> {
    const questions = new Map<Text, Noul>();
    facts.forEach((fact, at) => {
        questions.set(must(parseText(`keeps_${at}`)), {
            instructions: must(parseText(`Does \`brief\` carry what \`facts[${at}].text\` says, with the detail needed to act on it (names, paths and numbers kept)?`)),
            criteria: { true: must(parseText('The brief states it, or something that implies all of it, with the same names, paths and numbers.')), false: must(parseText('The brief leaves it out, or only gestures at it without the detail.')) },
        });
        if (fact.section === 'decisions' && fact.why !== null) {
            questions.set(must(parseText(`reason_${at}`)), {
                instructions: must(parseText(`Does \`brief\` give the reason in \`facts[${at}].why\` for \`facts[${at}].text\`?`)),
                criteria: { true: must(parseText('The brief says why that was decided.')), false: must(parseText('The brief holds the decision but not its reason.')) },
            });
        }
    });
    return questions;
}

export function unmetOf(answers: AnswerTally, facts: readonly CheckedFact[], keptAtLeast: Probability): readonly UnmetFact[] {
    return facts.flatMap((fact, index) => {
        if (!BLOCKING.has(fact.section)) return [];
        const keptAnswer = answers.get(must(parseText(`keeps_${index}`)));
        const reasonAnswer = answers.get(must(parseText(`reason_${index}`)));
        const parts: MissingPart[] = [];
        if (keptAnswer !== undefined && keptAnswer < keptAtLeast) parts.push('text');
        if (reasonAnswer !== undefined && reasonAnswer < keptAtLeast) parts.push('reason');
        return parts.length === 0 ? [] : [{ index: must(parseCount(index)), fact, parts }];
    });
}

export const unmetLinesOf = (missing: readonly UnmetFact[]): readonly Text[] =>
    missing.flatMap(({ fact, parts }) => parts.map((part) => must(parseText(part === 'text' ? `${fact.section}: ${fact.text}` : `the reason for the decision: ${fact.text} (${fact.why ?? ''})`))));

export async function checkCoverage(brief: Text, facts: readonly CheckedFact[], decider: Decider, keptAtLeast: Probability): Promise<CheckedCoverage> {
    if (facts.length === 0) return { complete: 'present', missing: [], missingFacts: [], answers: new Map(), unknown: null };
    const asked = await decider.ask(must(parseText(JSON.stringify({ brief, facts: facts.map((fact) => ({ section: fact.section, text: fact.text, why: fact.why })) }))), questionsOf(facts));
    if (isUnknown(asked)) return { complete: 'absent', missing: [], missingFacts: [], answers: new Map(), unknown: must(parseText(saying(asked.why))) };
    const missingFacts = unmetOf(asked.answers, facts, keptAtLeast);
    return { complete: missingFacts.length === 0 ? 'present' : 'absent', missing: unmetLinesOf(missingFacts), missingFacts, answers: asked.answers, unknown: null, costUsd: asked.costUsd };
}

export const correctionFor = (missing: readonly Text[]): Text =>
    must(parseText(`The first version did not keep these; keep every one of them, with its detail:\n${missing.map((line) => `- ${line}`).join('\n')}`));
