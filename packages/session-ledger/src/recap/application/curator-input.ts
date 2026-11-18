import type { Entry } from '#src/ports/transcripts.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { localTime } from './local-time.ts';
import { turnsOf } from './writer-transcript.ts';
import { element, leaf } from './xml.ts';

export interface CuratorMaterial {
    readonly name: string;
    readonly language: string;
    readonly rubric: string;
    readonly facts: readonly Fact[];
    readonly clock: { readonly now: number; readonly zone: string };
}

export const documentId = (at: number): string => `f${at + 1}`;

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

export interface ReconcileMaterial extends Omit<CuratorMaterial, 'facts'> {
    readonly open: readonly Fact[];
    readonly tail: readonly Entry[];
}

export const TAIL_CHARS = 12_000;

export function stillTrueOf(rubric: string): string {
    const lines = rubric.split('\n');
    const from = lines.findIndex((line) => line.startsWith('- **I7'));
    if (from < 0) {
        return '';
    }
    const next = lines.findIndex((line, at) => at > from && /^- \*\*I\d/.test(line));
    return lines.slice(from, next < 0 ? undefined : next).join('\n').trim();
}

export function reconcileInput(material: ReconcileMaterial): { readonly document: string; readonly facts: ReadonlyMap<string, Fact>; readonly tail: string } {
    const { clock } = material;
    const shown = turnsOf(material.tail, clock, TAIL_CHARS);
    const { document, facts } = curatorInput({ ...material, rubric: stillTrueOf(material.rubric), facts: material.open }, { tail: element('tail', shown.attrs, shown.body) });
    return { document, facts, tail: shown.body };
}
