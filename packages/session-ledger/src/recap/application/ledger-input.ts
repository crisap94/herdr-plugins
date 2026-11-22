import type { Count } from '#src/contract/kernel.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { InputAgent, InputFact, InputLedger } from '#src/ports/recap-input.ts';
import type { Fact, Section, TaskId } from '#src/recap/domain/fact.ts';
import { SECTION_IDS } from '#src/recap/domain/fact.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { positiveCount } from '#src/recap/domain/writer-view.ts';
import type { HiddenCounts, PositiveCount, WriterView } from '#src/recap/domain/writer-view.ts';

const textOf = brand<string, 'Text'>;
const countOf = brand<number, 'Count'>;

export type Several = Brand<boolean, 'Several'>;

export const severalOf = brand<boolean, 'Several'>;

export const CLOSED_SHOWN_MS = 2 * 3_600_000;

export interface TaskFacts {
    readonly key: Text;
    readonly open: readonly Fact[];
    readonly closed: readonly Fact[];
}

export function taskFactsOf(ledger: Pick<Ledger, 'openOf' | 'recentlyClosed'>, task: TaskId, at: Instant): TaskFacts {
    return { key: textOf(task.key), open: ledger.openOf(task), closed: ledger.recentlyClosed(task, at - CLOSED_SHOWN_MS) };
}

export interface Numbering {
    readonly ledgers: readonly InputLedger[];
    readonly byId: ReadonlyMap<Text, Fact>;
    readonly taskOf: ReadonlyMap<Text, Text>;
    readonly shown: ReadonlyMap<Text, ReadonlyMap<Text, Fact>>;
}

const agentIdOf = (fact: Fact, agents: readonly InputAgent[]): Text | null => {
    const id = fact.agent === null ? null : (agents.find((agent) => agent.label !== '' && agent.label === fact.agent)?.id ?? null);
    return id === null ? null : textOf(id);
};

interface ViewedFacts {
    readonly shown: readonly Fact[];
    readonly hidden: HiddenCounts;
}

const oldestFirst = (a: Fact, b: Fact): Count => countOf(a.lastAt - b.lastAt);

export function writerFacts(open: readonly Fact[], view: WriterView, now: Instant): ViewedFacts {
    const sorted = open.toSorted(oldestFirst);
    if (view.kind === 'full') {
        return { shown: sorted, hidden: new Map() };
    }
    const shown = new Set<Fact>();
    const hidden = new Map<Section, PositiveCount>();
    for (const section of SECTION_IDS) {
        const facts = sorted.filter((fact) => fact.section === section);
        const candidates = section === 'next' ? facts.filter((fact) => fact.lastAt >= now - view.nextHours * 3_600_000) : facts;
        const limited = section === 'done' || section === 'links' || section === 'next'
            ? candidates.slice(-Number(view.keepNewest))
            : candidates;
        limited.forEach((fact) => shown.add(fact));
        const count = facts.length - limited.length;
        if (count > 0) {
            hidden.set(section, positiveCount(count));
        }
    }
    return { shown: sorted.filter((fact) => shown.has(fact)), hidden };
}

export function numbered(tasks: readonly TaskFacts[], agents: readonly InputAgent[], several: Several, view: WriterView, now: Instant): Numbering {
    let next = 0;
    const byId = new Map<Text, Fact>();
    const taskOf = new Map<Text, Text>();
    const shown = new Map<Text, Map<Text, Fact>>();
    const ledgers = tasks.map((task): InputLedger => {
        const mine = new Map<Text, Fact>();
        shown.set(task.key, mine);
        const viewed = writerFacts(task.open, view, now);
        const facts = [...viewed.shown, ...task.closed].map((fact): InputFact => {
            const id = textOf(`f${(next += 1)}`);
            byId.set(id, fact);
            mine.set(id, fact);
            taskOf.set(id, task.key);
            return { id, section: fact.section, text: fact.text, state: fact.state, first: fact.firstAt, last: fact.lastAt, why: fact.why, ref: fact.ref, anchor: fact.anchor, agent: agentIdOf(fact, agents), closed: fact.closedWhy };
        });
        return { task: several ? task.key : null, facts, ...(viewed.hidden.size === 0 ? {} : { hidden: viewed.hidden }) };
    });
    return { ledgers, byId, taskOf, shown };
}
