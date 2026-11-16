import assert from 'node:assert/strict';
import type { AddOp, Fact, FactId, Operation, RunRef, Unknown } from '@stateforge-labs/session-ledger';
import { key, scope } from '../ids.ts';
import { factIdOf, runIdOf } from '../facts.ts';
import type { Case } from '../run.ts';
import type { StoreUnderTest } from '../memory-store.ts';
import { addOf, cursor, isUnknownValue, runOf, shapeOf } from './record-fixtures.ts';

const RUN = runIdOf('run_00000000000000000000000001');

const MINTED = factIdOf('fct_00000000000000000000000002');

const knownFacts = (read: readonly Fact[] | Unknown, what: string): readonly Fact[] => {
    if (isUnknownValue(read)) {
        throw new Error(`${what} is Unknown`);
    }
    return read;
};

const knownKeys = (read: readonly string[] | Unknown): readonly string[] => {
    if (isUnknownValue(read)) {
        throw new Error('keysOf is Unknown');
    }
    return read;
};

const nextOf = (text: string): AddOp => ({ ...addOf(text), section: 'next' });

const textsOf = (facts: readonly Fact[]): readonly string[] => facts.map((fact) => fact.text);

const firstOf = <T>(items: readonly T[], what: string): T => {
    const [first] = items;
    if (first === undefined) {
        throw new Error(`no ${what} to read`);
    }
    return first;
};

const writeAt = (store: StoreUnderTest, at: number, tab: string, task: string, ops: readonly Operation[]): void => {
    store.records.recordRun(runOf({ tab, at, lanes: [], tasks: [], ops: [{ task, ops }] }));
};

const closeOf = (id: FactId, why: 'done' | 'superseded' = 'done'): Operation => ({ op: 'close', id, why });

const idOfText = (store: StoreUnderTest, task: { readonly tab: string; readonly key: string }, text: string): FactId => {
    const found = knownFacts(store.facts.allOf(task), 'allOf').find((fact) => fact.text === text);
    if (found === undefined) {
        throw new Error(`no fact reads ${text}`);
    }
    return found.id;
};

const isThenable = (value: unknown): boolean => typeof value === 'object' && value !== null && 'then' in value;

const fresh = (at: number, tab: string, taskKey: string): RunRef => ({
    id: RUN,
    task: { tab, key: taskKey },
    at,
    language: 'en',
    mint: () => MINTED,
});

export const FCT_1: Case<null, StoreUnderTest> = {
    id: 'FCT-1',
    group: 'FCT',
    title: 'openOf returns only the open facts of the task, newest lastAt first',
    level: 'full',
    needsFold: true,
    async run(_world, store) {
        const task = { tab: 'tab-1', key: 'a' };
        writeAt(store, 100, 'tab-1', 'a', [nextOf('first')]);
        writeAt(store, 200, 'tab-1', 'a', [nextOf('second')]);
        writeAt(store, 300, 'tab-1', 'a', [nextOf('third')]);
        writeAt(store, 250, 'tab-1', 'b', [nextOf('elsewhere')]);
        writeAt(store, 400, 'tab-1', 'a', [closeOf(idOfText(store, task, 'second'))]);
        assert.deepEqual(textsOf(knownFacts(store.facts.openOf(task), 'openOf')), ['third', 'first']);
    },
};

export const FCT_2: Case<null, StoreUnderTest> = {
    id: 'FCT-2',
    group: 'FCT',
    title: 'recentlyClosed returns the closed facts since the instant, oldest closedAt first',
    level: 'full',
    needsFold: true,
    async run(_world, store) {
        const task = { tab: 'tab-1', key: 'a' };
        writeAt(store, 10, 'tab-1', 'a', [nextOf('x'), nextOf('y'), nextOf('z')]);
        writeAt(store, 100, 'tab-1', 'a', [closeOf(idOfText(store, task, 'z'))]);
        writeAt(store, 350, 'tab-1', 'a', [closeOf(idOfText(store, task, 'y'))]);
        writeAt(store, 250, 'tab-1', 'a', [closeOf(idOfText(store, task, 'x'))]);
        assert.deepEqual(textsOf(knownFacts(store.facts.recentlyClosed(task, 200), 'recentlyClosed')), ['x', 'y']);
    },
};

export const FCT_3: Case<null, StoreUnderTest> = {
    id: 'FCT-3',
    group: 'FCT',
    title: 'allOf returns every fact of the task, oldest firstAt first',
    level: 'full',
    needsFold: true,
    async run(_world, store) {
        const task = { tab: 'tab-1', key: 'a' };
        writeAt(store, 300, 'tab-1', 'a', [addOf('late')]);
        writeAt(store, 200, 'tab-1', 'b', [addOf('other')]);
        writeAt(store, 100, 'tab-1', 'a', [addOf('early')]);
        writeAt(store, 400, 'tab-1', 'a', [closeOf(idOfText(store, task, 'late'))]);
        assert.deepEqual(textsOf(knownFacts(store.facts.allOf(task), 'allOf')), ['early', 'late']);
    },
};

export const FCT_4: Case<null, StoreUnderTest> = {
    id: 'FCT-4',
    group: 'FCT',
    title: 'keysOf returns every task key of the scope and none of another scope',
    level: 'full',
    needsFold: true,
    async run(_world, store) {
        writeAt(store, 100, 'tab-1', 'a', [addOf('one')]);
        writeAt(store, 110, 'tab-1', 'b', [addOf('two')]);
        writeAt(store, 120, 'tab-2', 'c', [addOf('three')]);
        assert.deepEqual(knownKeys(store.facts.keysOf(scope('tab-1'))).toSorted(), ['a', 'b']);
    },
};

export const FCT_5: Case<null, StoreUnderTest> = {
    id: 'FCT-5',
    group: 'FCT',
    title: 'historyOf returns the facts of the tasks the key took part in, at most 300',
    level: 'full',
    needsFold: true,
    async run(_world, store) {
        store.records.recordRun(runOf({ tab: 'tab-1', at: 100, lanes: [cursor('a')], tasks: [shapeOf('a', ['a'])], ops: [{ task: 'a', ops: [addOf('kept')] }] }));
        store.records.recordRun(runOf({ tab: 'tab-1', at: 110, lanes: [cursor('p2')], tasks: [shapeOf('b', ['p2'])], ops: [{ task: 'b', ops: [addOf('other')] }] }));
        assert.deepEqual(store.facts.historyOf(scope('tab-1'), key('a')).map((fact) => fact.text), ['kept']);
        const many = Array.from({ length: 301 }, (_, index) => addOf(`fact ${index}`));
        store.records.recordRun(runOf({ tab: 'tab-1', at: 200, lanes: [cursor('c')], tasks: [shapeOf('c', ['c'])], ops: [{ task: 'c', ops: many }] }));
        assert.equal(store.facts.historyOf(scope('tab-1'), key('c')).length, 300);
    },
};

export const FCT_6: Case<null, StoreUnderTest> = {
    id: 'FCT-6',
    group: 'FCT',
    title: 'apply with an add returns the new fact with a fresh id, and openOf returns it',
    level: 'full',
    needsFold: true,
    async run(_world, store) {
        const task = { tab: 'tab-1', key: 'a' };
        const applied = store.facts.apply(fresh(500, 'tab-1', 'a'), [addOf('applied')]);
        assert.equal(applied.refused.length, 0);
        assert.equal(applied.changed.length, 1);
        assert.equal(firstOf(applied.changed, 'changed').text, 'applied');
        assert.deepEqual(textsOf(knownFacts(store.facts.openOf(task), 'openOf')), ['applied']);
        assert.equal(firstOf(knownFacts(store.facts.openOf(task), 'openOf'), 'openOf').id, firstOf(applied.changed, 'changed').id);
    },
};

export const FCT_7: Case<null, StoreUnderTest> = {
    id: 'FCT-7',
    group: 'FCT',
    title: 'apply with a refused op names the op and reason, and no fact changes',
    level: 'full',
    needsFold: true,
    async run(_world, store) {
        const task = { tab: 'tab-1', key: 'a' };
        writeAt(store, 100, 'tab-1', 'a', [addOf('keep')]);
        const before = store.facts.allOf(task);
        const refusal: Operation = closeOf(factIdOf('fct_00000000000000000000000009'));
        const applied = store.facts.apply(fresh(200, 'tab-1', 'a'), [refusal]);
        assert.equal(applied.changed.length, 0);
        assert.equal(applied.refused.length, 1);
        assert.deepEqual(firstOf(applied.refused, 'refusal').op, refusal);
        assert.equal(firstOf(applied.refused, 'refusal').reason, 'unknown-id');
        assert.deepEqual(store.facts.allOf(task), before);
    },
};

export const FCT_8: Case<null, StoreUnderTest> = {
    id: 'FCT-8',
    group: 'FCT',
    title: 'a failed read on openOf, recentlyClosed, allOf or keysOf is Unknown, never an empty list',
    level: 'full',
    async run(_world, store) {
        const task = { tab: 'nowhere', key: 'a' };
        store.failReads?.('openOf', 1);
        assert.equal(isUnknownValue(store.facts.openOf(task)), true);
        store.failReads?.('recentlyClosed', 1);
        assert.equal(isUnknownValue(store.facts.recentlyClosed(task, 0)), true);
        store.failReads?.('allOf', 1);
        assert.equal(isUnknownValue(store.facts.allOf(task)), true);
        store.failReads?.('keysOf', 1);
        assert.equal(isUnknownValue(store.facts.keysOf(scope('nowhere'))), true);
    },
};

export const FCT_9: Case<null, StoreUnderTest> = {
    id: 'FCT-9',
    group: 'FCT',
    title: 'every method returns synchronously, without a thenable',
    level: 'full',
    async run(_world, store) {
        const task = { tab: 'tab-1', key: 'a' };
        writeAt(store, 50, 'tab-1', 'a', [addOf('present')]);
        const results: readonly unknown[] = [
            store.facts.openOf(task),
            store.facts.recentlyClosed(task, 0),
            store.facts.allOf(task),
            store.facts.keysOf(scope('tab-1')),
            store.facts.historyOf(scope('tab-1'), key('a')),
            store.facts.apply(fresh(100, 'tab-1', 'a'), []),
        ];
        assert.equal(results.some(isThenable), false);
    },
};

export const FACT_CASES: readonly Case<null, StoreUnderTest>[] = [FCT_1, FCT_2, FCT_3, FCT_4, FCT_5, FCT_6, FCT_7, FCT_8, FCT_9];
