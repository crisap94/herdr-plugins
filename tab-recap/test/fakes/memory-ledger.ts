// An in-memory `Ledger`, for tests of everything that reads or writes facts without a database.
import type { Applied, HistoryFact, Ledger } from '#src/ports/ledger.ts';
import type { Fact, FactId, TaskId } from '#src/recap/domain/fact.ts';
import { sameTask } from '#src/recap/domain/fact.ts';
import { apply } from '#src/recap/domain/ops.ts';
import type { Operation, RunRef } from '#src/recap/domain/ops.ts';

const HISTORY_LIMIT = 300;

export class MemoryLedger implements Ledger {
    private facts: Fact[] = [];
    private readonly holders = new Map<string, Set<string>>();
    private counter = 0;

    /** a fact id as the fake mints them: `fct_1`, `fct_2`, … */
    mint = (): FactId => `fct_${(this.counter += 1)}` as FactId;

    /** put facts in directly (a task that already has a ledger) */
    seed(...facts: readonly Fact[]): this {
        this.facts = [...this.facts, ...facts];
        return this;
    }

    /** the panes that work on `task`, for `historyOf` */
    holds(task: TaskId, ...panes: readonly string[]): this {
        const key = `${task.tab}\u001f${task.key}`;
        this.holders.set(key, new Set([...(this.holders.get(key) ?? []), ...panes]));
        return this;
    }

    private of(task: TaskId): readonly Fact[] {
        return this.facts.filter((fact) => sameTask(fact.task, task));
    }

    openOf(task: TaskId): readonly Fact[] {
        return this.of(task).filter((fact) => fact.state === 'open').toSorted((a, b) => b.lastAt - a.lastAt);
    }

    recentlyClosed(task: TaskId, sinceMs: number): readonly Fact[] {
        return this.of(task).filter((fact) => fact.state === 'closed' && (fact.closedAt ?? 0) >= sinceMs).toSorted((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
    }

    allOf(task: TaskId): readonly Fact[] {
        return this.of(task).toSorted((a, b) => a.firstAt - b.firstAt);
    }

    apply(run: RunRef, ops: readonly Operation[]): Applied {
        const folded = apply(this.of(run.task), ops, run);
        this.facts = [...this.facts.filter((fact) => !sameTask(fact.task, run.task)), ...folded.ledger];
        return { changed: folded.changed, refused: folded.refused };
    }

    keysOf(tab: string): readonly string[] {
        return [...new Set(this.facts.filter((fact) => fact.task.tab === tab).map((fact) => fact.task.key))];
    }

    historyOf(tab: string, pane: string): readonly HistoryFact[] {
        return this.facts
            .filter((fact) => fact.task.tab === tab && this.holders.get(`${tab}\u001f${fact.task.key}`)?.has(pane) === true)
            .toSorted((a, b) => b.lastAt - a.lastAt)
            .slice(0, HISTORY_LIMIT)
            .map((fact) => ({ section: fact.section, text: fact.text, why: fact.why, state: fact.state, closedWhy: fact.closedWhy, closedAt: fact.closedAt, firstAt: fact.firstAt, lastAt: fact.lastAt }));
    }
}
