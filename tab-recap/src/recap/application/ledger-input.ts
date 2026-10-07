// The ledger as the writer reads it: the open facts of each task and those closed in the last two hours, numbered f1…fn across the
// document so an operation can name one. The numbering is kept: it is how the answer is mapped back to the facts.
import type { InputAgent, InputFact, InputLedger } from '#src/ports/recap-input.ts';
import type { Fact } from '#src/recap/domain/fact.ts';

/** A fact closed longer ago than this is not shown to the writer. */
export const CLOSED_SHOWN_MS = 2 * 3_600_000;

/** One task's facts: what the ledger holds for it. */
export interface TaskFacts {
    readonly key: string;
    readonly open: readonly Fact[];
    readonly closed: readonly Fact[];
}

/** The document ids and the facts they stand for, per task (a task's facts only answer to ids of that task). */
export interface Numbering {
    readonly ledgers: readonly InputLedger[];
    /** document id → fact, over the whole document */
    readonly byId: ReadonlyMap<string, Fact>;
    /** document id → the key of the task that holds it */
    readonly taskOf: ReadonlyMap<string, string>;
    /** the facts shown per task key, by document id */
    readonly shown: ReadonlyMap<string, ReadonlyMap<string, Fact>>;
}

const agentIdOf = (fact: Fact, agents: readonly InputAgent[]): string | null =>
    fact.agent === null ? null : (agents.find((agent) => agent.label !== '' && agent.label === fact.agent)?.id ?? null);

export function numbered(tasks: readonly TaskFacts[], agents: readonly InputAgent[], several: boolean): Numbering {
    let next = 0;
    const byId = new Map<string, Fact>();
    const taskOf = new Map<string, string>();
    const shown = new Map<string, Map<string, Fact>>();
    const ledgers = tasks.map((task): InputLedger => {
        const mine = new Map<string, Fact>();
        shown.set(task.key, mine);
        const facts = [...task.open.toSorted((a, b) => a.lastAt - b.lastAt), ...task.closed].map((fact): InputFact => {
            const id = `f${(next += 1)}`;
            byId.set(id, fact);
            mine.set(id, fact);
            taskOf.set(id, task.key);
            return { id, section: fact.section, text: fact.text, state: fact.state, first: fact.firstAt, last: fact.lastAt, why: fact.why, ref: fact.ref, agent: agentIdOf(fact, agents), closed: fact.closedWhy };
        });
        return { task: several ? task.key : null, facts };
    });
    return { ledgers, byId, taskOf, shown };
}
