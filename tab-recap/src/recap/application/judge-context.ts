import type { RunItem } from '#src/ports/run-inputs.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { element, leaf } from '@stateforge-labs/session-ledger/unstable/recap/application/xml.ts';

interface ScoringParts { readonly rubric: Text; readonly input: Text; readonly items: readonly RunItem[]; readonly state?: readonly RunItem[] }

interface CoverParts { readonly input: Text; readonly keyfacts: readonly Text[] | null; readonly state: readonly RunItem[] }

interface GradingParts { readonly input: Text; readonly keyfacts: readonly Text[]; readonly answers: readonly Text[] }

const NEST = '\n';


function recapOf(items: readonly RunItem[]): Text {
    return must(parseText(element('recap', {}, must(parseText(items.length === 0 ? '' : `${items.map((item) => `${NEST}${leaf('item', { key: must(parseText(item.key)), section: must(parseText(item.section)) }, must(parseText(item.text)))}`).join('')}${NEST}`)))));
}

function stateOf(items: readonly RunItem[]): Text {
    return must(parseText(element('state', {}, must(parseText(items.length === 0 ? '' : `${items.map((item) => `${NEST}${leaf('item', { key: must(parseText(item.key)), section: must(parseText(item.section)) }, must(parseText(item.text)))}`).join('')}${NEST}`)))));
}

export function scoringDocument(parts: ScoringParts): Text {
    const state = parts.state === undefined ? '' : `${stateOf(parts.state)}${NEST}`;
    return must(parseText(element('judge_input', { version: must(parseCount(1)) }, must(parseText(`${NEST}${leaf('rubric', {}, parts.rubric)}${NEST}${leaf('writer_input', {}, parts.input)}${NEST}${recapOf(parts.items)}${NEST}${state}`)))));
}

const keyfactsOf = (keyfacts: readonly Text[]): Text => must(parseText(element('keyfacts', {}, must(parseText(keyfacts.length === 0 ? '' : `${keyfacts.map((fact) => `${NEST}${leaf('keyfact', {}, fact)}`).join('')}${NEST}`)))));

export function coverDocument(parts: CoverParts): Text {
    const given = parts.keyfacts === null ? '' : `${keyfactsOf(parts.keyfacts)}${NEST}`;
    return must(parseText(element('cover_input', { version: must(parseCount(1)) }, must(parseText(`${NEST}${leaf('writer_input', {}, parts.input)}${NEST}${given}${stateOf(parts.state)}${NEST}`)))));
}

export const readbackDocument = (items: readonly RunItem[]): Text => must(parseText(element('readback_input', { version: must(parseCount(1)) }, must(parseText(`${NEST}${recapOf(items)}${NEST}`)))));

export function gradingDocument(parts: GradingParts): Text {
    const facts = keyfactsOf(parts.keyfacts);
    const answers = element('answers', {}, must(parseText(`${parts.answers.map((answer, at) => `${NEST}${leaf('answer', { question: must(parseCount(at + 1)) }, answer)}`).join('')}${NEST}`)));
    return must(parseText(element('grading_input', { version: must(parseCount(1)) }, must(parseText(`${NEST}${leaf('writer_input', {}, parts.input)}${NEST}${facts}${NEST}${answers}${NEST}`)))));
}
