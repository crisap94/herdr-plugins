import type { Count } from '#src/contract/kernel.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { localTime } from './local-time.ts';
import { turnsOf } from './writer-transcript.ts';
import { element, leaf, type Attributes } from './xml.ts';

const textOf = brand<string, 'Text'>;
const count = brand<number, 'Count'>;

export interface CuratorClock {
    readonly now: Instant;
    readonly zone: Text;
}

export interface CuratorMaterial {
    readonly name: Text;
    readonly language: Text;
    readonly rubric: Text;
    readonly facts: readonly Fact[];
    readonly clock: CuratorClock;
}

export interface ReconcileTail {
    readonly tail: Text;
}

export interface CuratorDocument {
    readonly document: Text;
    readonly facts: ReadonlyMap<Text, Fact>;
}

export interface ReconcileDocument extends CuratorDocument {
    readonly tail: Text;
}

export const documentId = (at: Count): Text => textOf(`f${at + 1}`);

export function curatorInput(material: CuratorMaterial, reconcile?: ReconcileTail): CuratorDocument {
    const { clock } = material;
    const at = (ms: Instant): Text => localTime(ms, clock.now, clock.zone);
    const named = new Map(material.facts.map((fact, index) => [documentId(count(index)), fact] as const));
    const rows = [...named].map(([id, fact]) => {
        const attrs: Attributes = {
            id, section: fact.section, state: fact.state, first: at(instant(fact.firstAt)), last: at(instant(fact.lastAt)), why: fact.why === null ? null : textOf(fact.why), ref: fact.ref === null ? null : textOf(fact.ref), agent: fact.agent === null ? null : textOf(fact.agent), closed: fact.closedWhy, closedat: fact.closedAt === null ? null : at(instant(fact.closedAt)),
        };
        return `\n ${leaf('fact', attrs, textOf(fact.text))}`;
    }).join('');
    const body = [
        `\n${element('task', { name: material.name === '' ? null : material.name, language: material.language, now: at(clock.now) })}`,
        `\n${leaf('rubric', {}, material.rubric)}`,
        `\n${element('ledger', {}, textOf(rows === '' ? '' : `${rows}\n`))}\n`,
        reconcile === undefined ? '' : `${reconcile.tail}\n`,
    ].join('');
    return { document: element('curator_input', { version: count(1), mode: reconcile === undefined ? null : 'reconcile' }, textOf(body)), facts: named };
}

export interface ReconcileMaterial extends Omit<CuratorMaterial, 'facts'> {
    readonly open: readonly Fact[];
    readonly tail: readonly Entry[];
}

export const TAIL_CHARS = count(12_000);

export function stillTrueOf(rubric: Text): Text {
    const lines = rubric.split('\n');
    const from = lines.findIndex((line) => line.startsWith('- **I7'));
    if (from < 0) {
        return textOf('');
    }
    const next = lines.findIndex((line, at) => at > from && /^- \*\*I\d/.test(line));
    return textOf(lines.slice(from, next < 0 ? undefined : next).join('\n').trim());
}

export function reconcileInput(material: ReconcileMaterial): ReconcileDocument {
    const { clock } = material;
    const shown = turnsOf(material.tail, clock, TAIL_CHARS);
    const { document, facts } = curatorInput({ ...material, rubric: stillTrueOf(material.rubric), facts: material.open }, { tail: element('tail', shown.attrs, shown.body) });
    return { document, facts, tail: shown.body };
}
