// EXP-002's brief corpus: the facts a brief must keep, the questions asked of each, and the document the brief job is given. Pure.
import type { Noul } from '#src/ports/decider.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { CAPS, NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';

/** The sections whose open facts a brief is checked for, in the order the design lists them. */
export const CHECKED_SECTIONS: readonly string[] = ['goal', 'now', 'needs', 'decisions', 'next', 'rules'];
export const MOST_FACTS = 40;

/** The open facts to check, newest first (the order the ledger gives), at most 40. */
export const factsToCheck = (history: readonly HistoryFact[]): readonly HistoryFact[] =>
    history.filter((fact) => fact.state === 'open' && CHECKED_SECTIONS.includes(fact.section)).slice(0, MOST_FACTS);

export const COVERAGE_QUESTIONS: Readonly<Record<string, Noul>> = {
    brief_keeps_fact: {
        instructions: 'Does `brief` carry `fact.text` with the detail needed to act on it (names, paths and numbers kept)?',
        criteria: { true: '`brief` states the fact, or something that implies the same action, with its names, paths and numbers.', false: '`brief` leaves the fact out, or keeps only a vague trace of it.' },
    },
    brief_keeps_reason: {
        instructions: 'Does `brief` give the reason in `fact.why` for `fact.text`?',
        criteria: { true: '`brief` says why the decision was taken, in the same sense as `fact.why`.', false: '`brief` states no reason, or a different one.' },
    },
};

/** The question ids asked about one fact: a decision also gets its reason. */
export const questionsFor = (fact: Pick<HistoryFact, 'section' | 'why'>): readonly string[] =>
    fact.section === 'decisions' && fact.why !== null ? ['brief_keeps_fact', 'brief_keeps_reason'] : ['brief_keeps_fact'];

/** The recap sections the live flow hands the brief job: the open facts by section, newest first, within each section's cap. */
export function sectionsOf(history: readonly HistoryFact[]): RecapSections {
    const open = history.filter((fact) => fact.state === 'open');
    const list = (section: keyof typeof CAPS): string[] => open.filter((fact) => fact.section === section).slice(0, CAPS[section]).map((fact) => fact.text);
    return {
        ...NO_SECTIONS, goal: open.find((fact) => fact.section === 'goal')?.text ?? '', now: list('now'), needs: list('needs'), done: list('done'), decisions: list('decisions'),
        next: list('next'), links: list('links'), rules: list('rules'),
    };
}
