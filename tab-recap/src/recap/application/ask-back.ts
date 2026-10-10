import type { InputCandidate, InputFact } from '#src/ports/recap-input.ts';
import { jaccard, tokensOf } from '#src/recap/domain/gates/jaccard.ts';
import { READBACK } from '#src/recap/domain/questions.ts';
import type { Question } from './enumerate-input.ts';

export const THIN_CHARS = 2_000;
export const MAX_FACT_QUESTIONS = 5;
const ABOUT = 0.3;
const MENTIONED = 0.5;

export interface Findings {
    readonly chunks: number;
    readonly chars: number;
    readonly candidates: readonly InputCandidate[];
    readonly open: readonly InputFact[];
    readonly said: string;
}

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

export function askBackFor(found: Findings): readonly Question[] {
    if (!wanted(found)) {
        return [];
    }
    const bare = READBACK.filter((question) => !found.candidates.some((one) => question.sections.includes(one.section))).map((question) => question.text);
    const changed = found.open.filter((fact) => fact.state === 'open' && mentioned(fact, found.said) && !found.candidates.some((one) => speaksOf(one, fact))).slice(0, MAX_FACT_QUESTIONS)
        .map((fact) => `What changed about the open fact "${fact.text}"?`);
    return [...bare, ...changed].map((text, at) => ({ id: `q${at + 1}`, text }));
}
