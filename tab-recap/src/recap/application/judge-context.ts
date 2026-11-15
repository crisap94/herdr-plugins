import type { RunItem } from '#src/ports/run-inputs.ts';
import { element, leaf } from './xml.ts';

interface ScoringParts { readonly rubric: string; readonly input: string; readonly items: readonly RunItem[]; readonly state?: readonly RunItem[] }

interface CoverParts { readonly input: string; readonly keyfacts: readonly string[] | null; readonly state: readonly RunItem[] }

interface GradingParts { readonly input: string; readonly keyfacts: readonly string[]; readonly answers: readonly string[] }

const NEST = '\n';

function recapOf(items: readonly RunItem[]): string {
    return element('recap', {}, items.length === 0 ? '' : `${items.map((item) => `${NEST}${leaf('item', { key: item.key, section: item.section }, item.text)}`).join('')}${NEST}`);
}

function stateOf(items: readonly RunItem[]): string {
    return element('state', {}, items.length === 0 ? '' : `${items.map((item) => `${NEST}${leaf('item', { key: item.key, section: item.section }, item.text)}`).join('')}${NEST}`);
}

export function scoringDocument(parts: ScoringParts): string {
    const state = parts.state === undefined ? '' : `${stateOf(parts.state)}${NEST}`;
    return element('judge_input', { version: 1 }, `${NEST}${leaf('rubric', {}, parts.rubric)}${NEST}${leaf('writer_input', {}, parts.input)}${NEST}${recapOf(parts.items)}${NEST}${state}`);
}

const keyfactsOf = (keyfacts: readonly string[]): string => element('keyfacts', {}, keyfacts.length === 0 ? '' : `${keyfacts.map((fact) => `${NEST}${leaf('keyfact', {}, fact)}`).join('')}${NEST}`);

export function coverDocument(parts: CoverParts): string {
    const given = parts.keyfacts === null ? '' : `${keyfactsOf(parts.keyfacts)}${NEST}`;
    return element('cover_input', { version: 1 }, `${NEST}${leaf('writer_input', {}, parts.input)}${NEST}${given}${stateOf(parts.state)}${NEST}`);
}

export const readbackDocument = (items: readonly RunItem[]): string => element('readback_input', { version: 1 }, `${NEST}${recapOf(items)}${NEST}`);

export function gradingDocument(parts: GradingParts): string {
    const facts = keyfactsOf(parts.keyfacts);
    const answers = element('answers', {}, `${parts.answers.map((answer, at) => `${NEST}${leaf('answer', { question: at + 1 }, answer)}`).join('')}${NEST}`);
    return element('grading_input', { version: 1 }, `${NEST}${leaf('writer_input', {}, parts.input)}${NEST}${facts}${NEST}${answers}${NEST}`);
}
