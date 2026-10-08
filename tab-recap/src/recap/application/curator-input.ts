// The curator's input: one `curator_input` document (schema/curator-input.dtd), data only. The instructions come separately.
import type { Entry } from '#src/ports/transcripts.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { localTime } from './local-time.ts';
import { turnsOf } from './writer-transcript.ts';
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
export function curatorInput(material: CuratorMaterial, reconcile?: { readonly tail: string }): { readonly document: string; readonly facts: ReadonlyMap<string, Fact> } {
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
        reconcile === undefined ? '' : `${reconcile.tail}\n`,
    ].join('');
    return { document: element('curator_input', { version: 1, mode: reconcile === undefined ? null : 'reconcile' }, body), facts: named };
}

/** What a reconciliation is given besides the facts: the rubric (only its "still true" check is shown) and the newest turns. */
export interface ReconcileMaterial extends Omit<CuratorMaterial, 'facts'> {
    /** the task's open facts, oldest first */
    readonly open: readonly Fact[];
    /** the newest turns of the task's agents, oldest first */
    readonly tail: readonly Entry[];
}

/** The characters of markup the newest turns are shown in. */
export const TAIL_CHARS = 12_000;

/** The check "I7 still true" of the rubric's item checks, as written there (with its examples). */
export function stillTrueOf(rubric: string): string {
    const lines = rubric.split('\n');
    const from = lines.findIndex((line) => line.startsWith('- **I7'));
    if (from < 0) {
        return '';
    }
    const next = lines.findIndex((line, at) => at > from && /^- \*\*I\d/.test(line));
    return lines.slice(from, next < 0 ? undefined : next).join('\n').trim();
}

/** The document of a reconciliation (`mode="reconcile"`): the open facts, the check, the newest turns; `tail` is their markup, what a quote is checked against. */
export function reconcileInput(material: ReconcileMaterial): { readonly document: string; readonly facts: ReadonlyMap<string, Fact>; readonly tail: string } {
    const { clock } = material;
    const shown = turnsOf(material.tail, clock, TAIL_CHARS);
    const { document, facts } = curatorInput({ ...material, rubric: stillTrueOf(material.rubric), facts: material.open }, { tail: element('tail', shown.attrs, shown.body) });
    return { document, facts, tail: shown.body };
}
