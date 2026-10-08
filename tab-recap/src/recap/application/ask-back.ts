// The bounded second look: when a run's turns are long or the candidates thin, the six read-back questions (and what changed about the open
// facts the turns mention) that the candidates cannot answer drive ONE more enumeration. Which questions is decided here, with no model.
import type { InputCandidate, InputFact } from '#src/ports/recap-input.ts';
import { jaccard, tokensOf } from '#src/recap/domain/gates/jaccard.ts';
import { READBACK } from '#src/recap/domain/questions.ts';
import type { Question } from './enumerate-input.ts';

/** A run is thin when it gave fewer candidates than one per this many characters of markup (and read at least that many). */
export const THIN_CHARS = 2_000;
/** The most open facts asked about. */
export const MAX_FACT_QUESTIONS = 5;
/** How alike a candidate and a fact must be for the candidate to speak of the fact. */
const ABOUT = 0.3;
/** The share of a fact's words that must be in the turns for the turns to mention it. */
const MENTIONED = 0.5;

/** What the run read, and found. */
export interface Findings {
    /** the chunks read in the first pass */
    readonly chunks: number;
    /** the markup read, in characters */
    readonly chars: number;
    readonly candidates: readonly InputCandidate[];
    /** the open facts of the ledger */
    readonly open: readonly InputFact[];
    /** everything the turns say */
    readonly said: string;
}

/** Whether a second look is due: the run took more than one chunk, or it is long enough to have a fact in it and gave too few. */
export const wanted = (found: Pick<Findings, 'chunks' | 'chars' | 'candidates'>): boolean =>
    found.chunks > 1 || (found.chars >= THIN_CHARS && found.candidates.length * THIN_CHARS < found.chars);

function mentioned(fact: InputFact, said: string): boolean {
    if (fact.ref !== null && said.includes(fact.ref)) {
        return true;
    }
    const [own, heard] = [tokensOf(fact.text), tokensOf(said)];
    return own.size >= 2 && [...own].filter((word) => heard.has(word)).length >= own.size * MENTIONED;
}

const speaksOf = (candidate: InputCandidate, fact: InputFact): boolean =>
    (fact.ref !== null && (candidate.ref === fact.ref || candidate.text.includes(fact.ref))) || jaccard(candidate.text, fact.text) >= ABOUT;

/** The questions to ask: empty when no second look is due or the candidates answer everything. */
export function askBackFor(found: Findings): readonly Question[] {
    if (!wanted(found)) {
        return [];
    }
    const bare = READBACK.filter((question) => !found.candidates.some((one) => question.sections.includes(one.section))).map((question) => question.text);
    const changed = found.open.filter((fact) => fact.state === 'open' && mentioned(fact, found.said) && !found.candidates.some((one) => speaksOf(one, fact))).slice(0, MAX_FACT_QUESTIONS)
        .map((fact) => `What changed about the open fact "${fact.text}"?`);
    return [...bare, ...changed].map((text, at) => ({ id: `q${at + 1}`, text }));
}
