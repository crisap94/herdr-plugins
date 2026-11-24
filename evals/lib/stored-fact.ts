import type { Fact, TaskId } from '../../packages/session-ledger/src/recap/domain/fact.ts';

export interface StoredTaskId {
    readonly tab: TaskId['scope'];
    readonly key: TaskId['key'];
}

export type StoredFact = Omit<Fact, 'task'> & { readonly task: StoredTaskId };

export const factOfStored = (fact: StoredFact): Fact => ({ ...fact, task: { scope: fact.task.tab, key: fact.task.key } });

export const factToStored = (fact: Fact): StoredFact => ({ ...fact, task: { tab: fact.task.scope, key: fact.task.key } });
