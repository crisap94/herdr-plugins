import { SECTIONS } from '#src/i18n/sections.ts';
import type { Count } from '#src/contract/kernel.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Stub } from './triggers.ts';
import type { TurnChunk } from './chunking.ts';
import { localTime, isoSecond } from './local-time.ts';
import { element, leaf } from './xml.ts';

const textOf = brand<string, 'Text'>;

const NEST = '\n';

export interface Question {
    readonly id: Text;
    readonly text: Text;
}

export interface MaterialTab {
    readonly id: Text;
    readonly now: Instant;
    readonly zone: Text;
}

export interface ChunkPosition {
    readonly index: Count;
    readonly of: Count;
}

export interface EnumerateMaterial {
    readonly language: Text;
    readonly tab: MaterialTab;
    readonly agent: Text;
    readonly chunk: TurnChunk;
    readonly position: ChunkPosition;
    readonly stubs: readonly Stub[];
    readonly questions: readonly Question[];
}

export const stubId = (at: Count): Text => textOf(`g${at + 1}`);

const SECTION_LINES = [...SECTIONS.map((section) => [section.id, section.hint] as const), ['rules', 'standing constraints the operator stated and still wants kept'] as const];

const skeleton = (): Text => textOf(element('sections', {}, SECTION_LINES.map(([id, hint]) => `${NEST}${leaf('section', { id }, hint)}`).join('') + NEST));

function triggersOf(material: EnumerateMaterial): Text {
    const { tab, stubs } = material;
    const rows = stubs.map((stub, at) => `${NEST}${leaf('trigger', { id: stubId(brand<number, 'Count'>(at)), kind: stub.kind, section: stub.section, ref: stub.ref, at: stub.at === null ? null : localTime(stub.at, tab.now, tab.zone) }, stub.anchor)}`);
    return textOf(rows.length === 0 ? '' : `${NEST}${element('triggers', {}, rows.join('') + NEST)}`);
}

function questionsOf(questions: readonly Question[]): Text {
    return textOf(questions.length === 0 ? '' : `${NEST}${element('questions', {}, questions.map((one) => `${NEST}${leaf('question', { id: one.id }, one.text)}`).join('') + NEST)}`);
}

export function enumerateInput(material: EnumerateMaterial): Text {
    const { tab, chunk, position } = material;
    const body = [
        `${NEST}${element('tab', { id: tab.id, now: isoSecond(tab.now), zone: tab.zone })}`, `${NEST}${skeleton()}`, triggersOf(material), questionsOf(material.questions),
        `${NEST}${element('chunk', { agent: material.agent, index: position.index, of: position.of }, chunk.markup)}${NEST}`,
    ].join('');
    return textOf(element('enumerate_input', { version: 1, language: material.language }, body));
}
