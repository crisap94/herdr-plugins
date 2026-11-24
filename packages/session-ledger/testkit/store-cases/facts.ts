import assert from 'node:assert/strict';
import type { Fact, TaskId, Unknown } from '@stateforge-labs/session-ledger';
import { key, scope } from '../ids.ts';
import type { Case } from '../run.ts';
import type { StoreUnderTest } from '../memory-store.ts';
import { cursor, factAt, isUnknownValue, runOf, shapeOf, typeIdAt } from './record-fixtures.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { tabId } from '../values.ts';
import { textOf } from '../../src/recap/domain/text.ts';
import { tabIdOf, paneIdOf } from '../../src/recap/domain/lane-shape.ts';

const TAB_1_A: TaskId = { scope: tabIdOf('tab-1'), key: textOf('a') };
const TAB_1_B: TaskId = { scope: tabIdOf('tab-1'), key: textOf('b') };

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

const textsOf = (facts: readonly Fact[]): readonly string[] => facts.map((fact) => fact.text);

const isThenable = (value: unknown): boolean => typeof value === 'object' && value !== null && 'then' in value;

const writeFacts = (store: StoreUnderTest, at: number, tab: string, facts: readonly Fact[]): void => {
    const keys = [...new Set(facts.map((fact) => fact.task.key))];
    store.records.recordRun(runOf({ scope: tabId(tab), at: instant(at), sessions: keys.map((k) => cursor(k)), tasks: keys.map((k) => shapeOf(k, [paneIdOf(k)])), changed: facts }));
};

const openAt = (id: number, text: string, firstAt: number, lastAt: number, task: TaskId = TAB_1_A): Fact =>
    factAt(typeIdAt(id), { task, text: textOf(text), firstAt: instant(firstAt), lastAt: instant(lastAt) });

const closedAt = (id: number, text: string, closedAtMs: number, firstAt: number, task: TaskId = TAB_1_A): Fact =>
    factAt(typeIdAt(id), {
        task,
        text: textOf(text),
        firstAt: instant(firstAt),
        lastAt: instant(closedAtMs),
        state: 'closed',
        closedWhy: 'done',
        closedAt: instant(closedAtMs),
    });

export const FCT_1: Case<null, StoreUnderTest> = {
    id: 'FCT-1',
    group: 'FCT',
    title: 'openOf returns only the open facts of the task, newest lastAt first',
    level: 'full',
    async run(_world, store) {
        writeFacts(store, 400, 'tab-1', [
            openAt(1, 'first', 100, 100),
            closedAt(2, 'second', 400, 200),
            openAt(3, 'third', 300, 300),
            openAt(4, 'elsewhere', 250, 250, TAB_1_B),
        ]);
        assert.deepEqual(textsOf(knownFacts(store.facts.openOf(TAB_1_A), 'openOf')), ['third', 'first']);
    },
};

export const FCT_2: Case<null, StoreUnderTest> = {
    id: 'FCT-2',
    group: 'FCT',
    title: 'recentlyClosed returns the closed facts since the instant, oldest closedAt first',
    level: 'full',
    async run(_world, store) {
        writeFacts(store, 400, 'tab-1', [closedAt(1, 'z', 100, 10), closedAt(2, 'y', 350, 10), closedAt(3, 'x', 250, 10)]);
        assert.deepEqual(textsOf(knownFacts(store.facts.recentlyClosed(TAB_1_A, instant(200)), 'recentlyClosed')), ['x', 'y']);
    },
};

export const FCT_3: Case<null, StoreUnderTest> = {
    id: 'FCT-3',
    group: 'FCT',
    title: 'allOf returns every fact of the task, oldest firstAt first',
    level: 'full',
    async run(_world, store) {
        writeFacts(store, 400, 'tab-1', [closedAt(1, 'late', 400, 300), openAt(2, 'other', 200, 200, TAB_1_B), openAt(3, 'early', 100, 100)]);
        assert.deepEqual(textsOf(knownFacts(store.facts.allOf(TAB_1_A), 'allOf')), ['early', 'late']);
    },
};

export const FCT_4: Case<null, StoreUnderTest> = {
    id: 'FCT-4',
    group: 'FCT',
    title: 'keysOf returns every task key of the scope and none of another scope',
    level: 'full',
    async run(_world, store) {
        writeFacts(store, 120, 'tab-1', [openAt(1, 'one', 100, 100), openAt(2, 'two', 110, 110, TAB_1_B)]);
        writeFacts(store, 120, 'tab-2', [openAt(3, 'three', 120, 120, { scope: tabIdOf('tab-2'), key: textOf('c') })]);
        assert.deepEqual(knownKeys(store.facts.keysOf(scope('tab-1'))).toSorted(), ['a', 'b']);
    },
};

export const FCT_5: Case<null, StoreUnderTest> = {
    id: 'FCT-5',
    group: 'FCT',
    title: 'historyOf returns the facts of the tasks the key took part in, at most 300',
    level: 'full',
    async run(_world, store) {
        writeFacts(store, 100, 'tab-1', [openAt(1, 'kept', 100, 100)]);
        writeFacts(store, 110, 'tab-1', [openAt(2, 'other', 110, 110, TAB_1_B)]);
        assert.deepEqual(store.facts.historyOf(scope('tab-1'), key('a')).map((fact) => fact.text), ['kept']);
        const many = Array.from({ length: 301 }, (_, index) => openAt(100 + index, `fact ${index}`, index, index, { scope: tabIdOf('tab-1'), key: textOf('c') }));
        writeFacts(store, 200, 'tab-1', many);
        assert.equal(store.facts.historyOf(scope('tab-1'), key('c')).length, 300);
    },
};

export const FCT_8: Case<null, StoreUnderTest> = {
    id: 'FCT-8',
    group: 'FCT',
    title: 'a failed read on openOf, recentlyClosed, allOf or keysOf is Unknown, never an empty list',
    level: 'full',
    async run(_world, store) {
        const task = { scope: tabIdOf('nowhere'), key: textOf('a') };
        store.failReads?.('openOf', 1);
        assert.equal(isUnknownValue(store.facts.openOf(task)), true);
        store.failReads?.('recentlyClosed', 1);
        assert.equal(isUnknownValue(store.facts.recentlyClosed(task, instant(0))), true);
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
        writeFacts(store, 50, 'tab-1', [openAt(1, 'present', 50, 50)]);
        const results: readonly unknown[] = [
            store.facts.openOf(TAB_1_A),
            store.facts.recentlyClosed(TAB_1_A, instant(0)),
            store.facts.allOf(TAB_1_A),
            store.facts.keysOf(scope('tab-1')),
            store.facts.historyOf(scope('tab-1'), key('a')),
        ];
        assert.equal(results.some(isThenable), false);
    },
};

export const FACT_CASES: readonly Case<null, StoreUnderTest>[] = [FCT_1, FCT_2, FCT_3, FCT_4, FCT_5, FCT_8, FCT_9];
