// The curator's input: one `curator_input` document (schema/curator-input.dtd), data only. The instructions come separately.
import type { Fact } from '#src/recap/domain/fact.ts';
import { localTime } from './local-time.ts';
import { element, leaf } from './xml.ts';

export interface CuratorMaterial {
    readonly name: string;
    readonly language: string;
    /** the rubric's "Every item" checks, verbatim */
    readonly rubric: string;
    /** every fact of the task, oldest first */
    readonly facts: readonly Fact[];
    readonly clock: { readonly now: number; readonly zone: string };
}

/** The id a fact has in the document: `f1…fn` in the order given. */
export const documentId = (at: number): string => `f${at + 1}`;

/** The document for `material`, and the fact each document id stands for. */
export function curatorInput(material: CuratorMaterial): { readonly document: string; readonly facts: ReadonlyMap<string, Fact> } {
    const { clock } = material;
    const at = (ms: number): string => localTime(ms, clock.now, clock.zone);
    const named = new Map(material.facts.map((fact, index) => [documentId(index), fact] as const));
    const rows = [...named].map(([id, fact]) => `\n ${leaf('fact', {
        id, section: fact.section, state: fact.state, first: at(fact.firstAt), last: at(fact.lastAt), why: fact.why, ref: fact.ref, agent: fact.agent, closed: fact.closedWhy, closedat: fact.closedAt === null ? null : at(fact.closedAt),
    }, fact.text)}`).join('');
    const body = [
        `\n${element('task', { name: material.name === '' ? null : material.name, language: material.language, now: at(clock.now) })}`,
        `\n${leaf('rubric', {}, material.rubric)}`,
        `\n${element('ledger', {}, rows === '' ? '' : `${rows}\n`)}\n`,
    ].join('');
    return { document: element('curator_input', { version: 1 }, body), facts: named };
}
