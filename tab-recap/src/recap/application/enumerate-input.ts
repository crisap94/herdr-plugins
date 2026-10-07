// The enumeration's input: one `enumerate_input` document (schema/enumerate-input.dtd), data only. The instructions come separately.
import { SECTIONS } from '#src/i18n/sections.ts';
import type { Stub } from './triggers.ts';
import type { TurnChunk } from './chunking.ts';
import { localTime, isoSecond } from './local-time.ts';
import { element, leaf } from './xml.ts';

const NEST = '\n';

/** A question of an ask-back: what the candidates so far cannot answer. */
export interface Question {
    readonly id: string;
    readonly text: string;
}

export interface EnumerateMaterial {
    readonly language: string;
    readonly tab: { readonly id: string; readonly now: number; readonly zone: string };
    /** the id of the agent (`a1`) the chunk comes from */
    readonly agent: string;
    readonly chunk: TurnChunk;
    readonly position: { readonly index: number; readonly of: number };
    readonly stubs: readonly Stub[];
    readonly questions: readonly Question[];
}

/** The id a stub has in the document: `g1…gn` in the order given. */
export const stubId = (at: number): string => `g${at + 1}`;

const SECTION_LINES = [...SECTIONS.map((section) => [section.id, section.hint] as const), ['rules', 'standing constraints the operator stated and still wants kept'] as const];

const skeleton = (): string => element('sections', {}, SECTION_LINES.map(([id, hint]) => `${NEST}${leaf('section', { id }, hint)}`).join('') + NEST);

function triggersOf(material: EnumerateMaterial): string {
    const { tab, stubs } = material;
    const rows = stubs.map((stub, at) => `${NEST}${leaf('trigger', { id: stubId(at), kind: stub.kind, section: stub.section, ref: stub.ref, at: stub.at === null ? null : localTime(stub.at, tab.now, tab.zone) }, stub.anchor)}`);
    return rows.length === 0 ? '' : `${NEST}${element('triggers', {}, rows.join('') + NEST)}`;
}

function questionsOf(questions: readonly Question[]): string {
    return questions.length === 0 ? '' : `${NEST}${element('questions', {}, questions.map((one) => `${NEST}${leaf('question', { id: one.id }, one.text)}`).join('') + NEST)}`;
}

export function enumerateInput(material: EnumerateMaterial): string {
    const { tab, chunk, position } = material;
    const body = [
        `${NEST}${element('tab', { id: tab.id, now: isoSecond(tab.now), zone: tab.zone })}`, `${NEST}${skeleton()}`, triggersOf(material), questionsOf(material.questions),
        `${NEST}${element('chunk', { agent: material.agent, index: position.index, of: position.of }, chunk.markup)}${NEST}`,
    ].join('');
    return element('enumerate_input', { version: 1, language: material.language }, body);
}
