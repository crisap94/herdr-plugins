import type { InputAgent, InputFact, InputLedger } from '#src/ports/recap-input.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { SECTION_IDS } from '#src/recap/domain/fact.ts';
import { FULL_WRITER_VIEW, positiveCount } from '#src/recap/domain/writer-view.ts';
import type { WriterView } from '#src/recap/domain/writer-view.ts';

export const CLOSED_SHOWN_MS = 2 * 3_600_000;

export interface TaskFacts {
    readonly key: string;
    readonly open: readonly Fact[];
    readonly closed: readonly Fact[];
}

export interface Numbering {
    readonly ledgers: readonly InputLedger[];
    readonly byId: ReadonlyMap<string, Fact>;
    readonly taskOf: ReadonlyMap<string, string>;
    readonly shown: ReadonlyMap<string, ReadonlyMap<string, Fact>>;
}

const agentIdOf = (fact: Fact, agents: readonly InputAgent[]): string | null =>
    fact.agent === null ? null : (agents.find((agent) => agent.label !== '' && agent.label === fact.agent)?.id ?? null);

interface ViewedFacts {
    readonly shown: readonly Fact[];
    readonly hidden: ReadonlyMap<Fact['section'], ReturnType<typeof positiveCount>>;
}

export function writerFacts(open: readonly Fact[], view: WriterView, now: number): ViewedFacts {
    const sorted = open.toSorted((a, b) => a.lastAt - b.lastAt);
    if (view.kind === 'full') {
        return { shown: sorted, hidden: new Map() };
    }
    const shown = new Set<Fact>();
    const hidden = new Map<Fact['section'], ReturnType<typeof positiveCount>>();
    for (const section of SECTION_IDS) {
        const facts = sorted.filter((fact) => fact.section === section);
        const candidates = section === 'next' ? facts.filter((fact) => fact.lastAt >= now - view.nextHours * 3_600_000) : facts;
        const limited = section === 'done' || section === 'links' || section === 'next'
            ? candidates.slice(-view.keepNewest)
            : candidates;
        limited.forEach((fact) => shown.add(fact));
        const count = facts.length - limited.length;
        if (count > 0) {
            hidden.set(section, positiveCount(count));
        }
    }
    return { shown: sorted.filter((fact) => shown.has(fact)), hidden };
}

export function numbered(tasks: readonly TaskFacts[], agents: readonly InputAgent[], several: boolean): Numbering;
export function numbered(tasks: readonly TaskFacts[], agents: readonly InputAgent[], several: boolean, view: WriterView, now: number): Numbering;
export function numbered(tasks: readonly TaskFacts[], agents: readonly InputAgent[], several: boolean, view: WriterView = FULL_WRITER_VIEW, now?: number): Numbering {
    if (view.kind === 'pruned' && now === undefined) {
        throw new Error('a pruned writer view needs its clock');
    }
    let next = 0;
    const byId = new Map<string, Fact>();
    const taskOf = new Map<string, string>();
    const shown = new Map<string, Map<string, Fact>>();
    const ledgers = tasks.map((task): InputLedger => {
        const mine = new Map<string, Fact>();
        shown.set(task.key, mine);
        const viewed = writerFacts(task.open, view, now ?? 0);
        const facts = [...viewed.shown, ...task.closed].map((fact): InputFact => {
            const id = `f${(next += 1)}`;
            byId.set(id, fact);
            mine.set(id, fact);
            taskOf.set(id, task.key);
            return { id, section: fact.section, text: fact.text, state: fact.state, first: fact.firstAt, last: fact.lastAt, why: fact.why, ref: fact.ref, anchor: fact.anchor, agent: agentIdOf(fact, agents), closed: fact.closedWhy };
        });
        return { task: several ? task.key : null, facts, ...(viewed.hidden.size === 0 ? {} : { hidden: viewed.hidden }) };
    });
    return { ledgers, byId, taskOf, shown };
}
