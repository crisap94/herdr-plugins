import type { Decider, Noul } from '#src/ports/decider.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

const COVERED: ReadonlySet<string> = new Set(['goal', 'now', 'needs', 'decisions', 'next', 'rules']);
const BLOCKING: ReadonlySet<string> = new Set(['goal', 'needs', 'decisions', 'rules']);
export const FACTS_CHECKED = 40;
export const KEPT_AT_LEAST = 0.70;

export interface CoverageFact {
    readonly section: string;
    readonly text: string;
    readonly why: string | null;
}

export interface Coverage {
    readonly ok: boolean;
    readonly missing: readonly string[];
    readonly missingFacts: readonly MissingFact[];
    readonly answers: Readonly<Record<string, number>>;
    readonly unknown: string | null;
    readonly costUsd?: number | null;
}

export const factsOf = (history: readonly HistoryFact[]): readonly CoverageFact[] =>
    history.filter((fact) => fact.state === 'open' && COVERED.has(fact.section)).slice(0, FACTS_CHECKED).map((fact) => ({ section: fact.section, text: fact.text, why: fact.why }));

export function questionsFor(facts: readonly CoverageFact[]): ReadonlyMap<Text, Noul> {
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

export type MissingPart = 'text' | 'reason';

export interface MissingFact {
    readonly index: number;
    readonly fact: CoverageFact;
    readonly parts: readonly MissingPart[];
}

export function missingOf(answers: Readonly<Record<string, number>>, facts: readonly CoverageFact[], keptAtLeast: number = KEPT_AT_LEAST): readonly MissingFact[] {
    return facts.flatMap((fact, index) => {
        if (!BLOCKING.has(fact.section)) return [];
        const kept = (answers[`keeps_${index}`] ?? 1) >= keptAtLeast;
        const reasoned = (answers[`reason_${index}`] ?? 1) >= keptAtLeast;
        const parts: readonly MissingPart[] = [...(kept ? [] : ['text' as const]), ...(reasoned ? [] : ['reason' as const])];
        return parts.length === 0 ? [] : [{ index, fact, parts }];
    });
}

export const linesOf = (missing: readonly MissingFact[]): readonly string[] => missing.flatMap(({ fact, parts }) => parts.map((part) => part === 'text' ? `${fact.section}: ${fact.text}` : `the reason for the decision: ${fact.text} (${fact.why ?? ''})`));

export async function covered(brief: string, facts: readonly CoverageFact[], decider: Decider, keptAtLeast: number = KEPT_AT_LEAST): Promise<Coverage> {
    if (facts.length === 0) return { ok: true, missing: [], missingFacts: [], answers: {}, unknown: null };
    const asked = await decider.ask(must(parseText(JSON.stringify({ brief, facts: facts.map((fact) => ({ section: fact.section, text: fact.text, why: fact.why })) }))), questionsFor(facts));
    if (isUnknown(asked)) return { ok: false, missing: [], missingFacts: [], answers: {}, unknown: saying(asked.why) };
    const missingFacts = missingOf(Object.fromEntries(asked.answers), facts, keptAtLeast);
    return { ok: missingFacts.length === 0, missing: linesOf(missingFacts), missingFacts, answers: Object.fromEntries(asked.answers), unknown: null, costUsd: asked.costUsd };
}

export const correctionOf = (missing: readonly string[]): string => `The first version did not keep these; keep every one of them, with its detail:\n${missing.map((line) => `- ${line}`).join('\n')}`;
