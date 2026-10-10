// Does the brief keep what the goal needs? Code lists the facts; the decider answers one question per fact (never one over the whole list).
import type { Decider, Noul } from '#src/ports/decider.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';

/** The open sections whose facts the brief is checked against. */
const COVERED: ReadonlySet<string> = new Set(['goal', 'now', 'needs', 'decisions', 'next', 'rules']);
/** A missing one of these blocks an automatic compaction; `now` and `next` are only recorded. */
const BLOCKING: ReadonlySet<string> = new Set(['goal', 'needs', 'decisions', 'rules']);
export const FACTS_CHECKED = 40;
/** An answer below this says the brief does not keep the fact. */
export const KEPT_AT_LEAST = 0.70;

export interface CoverageFact {
    readonly section: string;
    readonly text: string;
    readonly why: string | null;
}

export interface Coverage {
    readonly ok: boolean;
    /** the facts (and reasons) the brief does not keep, among the blocking sections, as words */
    readonly missing: readonly string[];
    /** `keeps_<i>` and `reason_<i>` → probability; empty when the decider could not answer */
    readonly answers: Readonly<Record<string, number>>;
    /** why the decider could not answer, else null */
    readonly unknown: string | null;
}

/** The open goal, now, needs, decisions, next and rules facts, newest first as the ledger hands them, at most 40. */
export const factsOf = (history: readonly HistoryFact[]): readonly CoverageFact[] =>
    history.filter((fact) => fact.state === 'open' && COVERED.has(fact.section)).slice(0, FACTS_CHECKED).map((fact) => ({ section: fact.section, text: fact.text, why: fact.why }));

/** `keeps_<i>` for every fact, `reason_<i>` for every decision that has a reason. */
export function questionsFor(facts: readonly CoverageFact[]): Readonly<Record<string, Noul>> {
    const questions: Record<string, Noul> = {};
    facts.forEach((fact, at) => {
        questions[`keeps_${at}`] = {
            instructions: `Does \`brief\` carry what \`facts[${at}].text\` says, with the detail needed to act on it (names, paths and numbers kept)?`,
            criteria: { true: 'The brief states it, or something that implies all of it, with the same names, paths and numbers.', false: 'The brief leaves it out, or only gestures at it without the detail.' },
        };
        if (fact.section === 'decisions' && fact.why !== null) {
            questions[`reason_${at}`] = {
                instructions: `Does \`brief\` give the reason in \`facts[${at}].why\` for \`facts[${at}].text\`?`,
                criteria: { true: 'The brief says why that was decided.', false: 'The brief holds the decision but not its reason.' },
            };
        }
    });
    return questions;
}

/** The facts and reasons below the pass mark (`keptAtLeast`, the autocompact style's), among the blocking sections. */
export function missingOf(answers: Readonly<Record<string, number>>, facts: readonly CoverageFact[], keptAtLeast: number = KEPT_AT_LEAST): readonly string[] {
    return facts.flatMap((fact, at) => {
        if (!BLOCKING.has(fact.section)) return [];
        const kept = (answers[`keeps_${at}`] ?? 1) >= keptAtLeast;
        const reasoned = (answers[`reason_${at}`] ?? 1) >= keptAtLeast;
        return [...(kept ? [] : [`${fact.section}: ${fact.text}`]), ...(reasoned ? [] : [`the reason for the decision: ${fact.text} (${fact.why ?? ''})`])];
    });
}

/** Asks the decider about the brief; a decider that cannot answer leaves the brief unchecked (`ok` false, `unknown` says why). */
export async function covered(brief: string, facts: readonly CoverageFact[], decider: Decider, keptAtLeast: number = KEPT_AT_LEAST): Promise<Coverage> {
    if (facts.length === 0) return { ok: true, missing: [], answers: {}, unknown: null };
    const asked = await decider.ask({ brief, facts: facts.map((fact) => ({ section: fact.section, text: fact.text, why: fact.why })) }, questionsFor(facts));
    if (isUnknown(asked)) return { ok: false, missing: [], answers: {}, unknown: saying(asked.why) };
    const missing = missingOf(asked.answers, facts, keptAtLeast);
    return { ok: missing.length === 0, missing, answers: asked.answers, unknown: null };
}

/** What the rewrite is told: the facts the first brief lost, one per line. */
export const correctionOf = (missing: readonly string[]): string => `The first version did not keep these; keep every one of them, with its detail:\n${missing.map((line) => `- ${line}`).join('\n')}`;
