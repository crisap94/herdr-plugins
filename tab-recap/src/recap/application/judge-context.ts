// The judge's three documents (schema/judge-input.dtd): scoring, read-back and grading the read-back. Data only; the rules come separately.
import type { RunItem } from '#src/ports/run-inputs.ts';
import { element, leaf } from './xml.ts';

const NEST = '\n';

function recapOf(items: readonly RunItem[]): string {
    return element('recap', {}, items.length === 0 ? '' : `${items.map((item) => `${NEST}${leaf('item', { key: item.key, section: item.section }, item.text)}`).join('')}${NEST}`);
}

/** What the judge scores: the rubric, what the writer saw, what it wrote. */
export function scoringDocument(parts: { readonly rubric: string; readonly input: string; readonly items: readonly RunItem[] }): string {
    return element('judge_input', { version: 1 }, `${NEST}${leaf('rubric', {}, parts.rubric)}${NEST}${leaf('writer_input', {}, parts.input)}${NEST}${recapOf(parts.items)}${NEST}`);
}

/** What the read-back call sees: the recap alone. */
export const readbackDocument = (items: readonly RunItem[]): string => element('readback_input', { version: 1 }, `${NEST}${recapOf(items)}${NEST}`);

/** What grades the read-back: the writer's input, the key facts, and the answers in question order. */
export function gradingDocument(parts: { readonly input: string; readonly keyfacts: readonly string[]; readonly answers: readonly string[] }): string {
    const facts = element('keyfacts', {}, parts.keyfacts.length === 0 ? '' : `${parts.keyfacts.map((fact) => `${NEST}${leaf('keyfact', {}, fact)}`).join('')}${NEST}`);
    const answers = element('answers', {}, `${parts.answers.map((answer, at) => `${NEST}${leaf('answer', { question: at + 1 }, answer)}`).join('')}${NEST}`);
    return element('grading_input', { version: 1 }, `${NEST}${leaf('writer_input', {}, parts.input)}${NEST}${facts}${NEST}${answers}${NEST}`);
}
