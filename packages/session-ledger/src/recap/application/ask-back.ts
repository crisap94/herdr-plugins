import type { Count } from '#src/contract/kernel.ts';
import type { InputCandidate, InputFact } from '#src/ports/recap-input.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import { jaccard, tokensOf } from '#src/recap/domain/gates/jaccard.ts';
import { READBACK } from '#src/recap/domain/questions.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Question } from './enumerate-input.ts';

export type Wanted = Brand<boolean, 'Wanted'>;

export const THIN_CHARS = brand<number, 'Count'>(2_000);
export const MAX_FACT_QUESTIONS = brand<number, 'Count'>(5);
const ABOUT = 0.3;
const MENTIONED = 0.5;

export interface Findings {
    readonly chunks: Count;
    readonly chars: Count;
    readonly candidates: readonly InputCandidate[];
    readonly open: readonly InputFact[];
    readonly said: Text;
}

export const wanted = (found: Pick<Findings, 'chunks' | 'chars' | 'candidates'>): Wanted =>
    brand<boolean, 'Wanted'>(found.chunks > 1 || (found.chars >= THIN_CHARS && found.candidates.length * THIN_CHARS < found.chars));

function mentionedIn(said: Text, facts: readonly InputFact[]): readonly InputFact[] {
    return facts.filter((fact) => {
        if (fact.state !== 'open') {
            return false;
        }
        if (fact.ref !== null && said.includes(fact.ref)) {
            return true;
        }
        const [own, heard] = [tokensOf(fact.text), tokensOf(said)];
        return own.size >= 2 && [...own].filter((word) => heard.has(word)).length >= own.size * MENTIONED;
    });
}

function unspoken(facts: readonly InputFact[], candidates: readonly InputCandidate[]): readonly InputFact[] {
    return facts.filter((fact) => !candidates.some((candidate) =>
        (fact.ref !== null && (candidate.ref === fact.ref || candidate.text.includes(fact.ref))) || jaccard(candidate.text, fact.text) >= ABOUT));
}

export function askBackFor(found: Findings): readonly Question[] {
    if (!wanted(found)) {
        return [];
    }
    const bare = READBACK.filter((question) => !found.candidates.some((one) => question.sections.includes(one.section))).map((question) => question.text);
    const changed = unspoken(mentionedIn(found.said, found.open), found.candidates).slice(0, MAX_FACT_QUESTIONS)
        .map((fact) => `What changed about the open fact "${fact.text}"?`);
    return [...bare, ...changed].map((text, at) => ({ id: brand<string, 'Text'>(`q${at + 1}`), text: brand<string, 'Text'>(text) }));
}
