import assert from 'node:assert/strict';
import type { Fact, TaskId, Unknown } from '@stateforge-labs/session-ledger';
import { factIdOf } from '../facts.ts';
import type { Case } from '../run.ts';
import type { StoreUnderTest } from '../memory-store.ts';
import { cursor, factAt, isUnknownValue, runOf, shapeOf, typeIdAt } from './record-fixtures.ts';
import { instant } from '@stateforge-labs/session-ledger';

const TASK: TaskId = { tab: 'tab-1', key: 'a' };

const knownFacts = (read: readonly Fact[] | Unknown, what: string): readonly Fact[] => {
    if (isUnknownValue(read)) {
        throw new Error(`${what} is Unknown`);
    }
    return read;
};

export const REC_14: Case<null, StoreUnderTest> = {
    id: 'REC-14',
    group: 'REC',
    title: 'fold result stored: recordRun with changed facts returns exactly those facts and ids; the store folds nothing and mints nothing',
    level: 'full',
    async run(_world, store) {
        const goal = factAt(typeIdAt(11), { task: TASK, section: 'goal', text: 'goal', firstAt: 90, lastAt: 100 });
        const now = factAt(typeIdAt(12), { task: TASK, section: 'now', text: 'now', firstAt: 95, lastAt: 100 });
        store.records.recordRun(runOf({ at: instant(100), lanes: [cursor('p1')], tasks: [shapeOf('a', ['p1'])], changed: [goal, now] }));
        const nowClosed = factAt(typeIdAt(12), {
            task: TASK,
            section: 'now',
            text: 'now',
            firstAt: 95,
            lastAt: 200,
            state: 'closed',
            closedWhy: 'done',
            closedAt: 200,
        });
        const added = factAt(typeIdAt(13), { task: TASK, section: 'goal', text: 'added', firstAt: 200, lastAt: 200 });
        store.records.recordRun(
            runOf({
                at: instant(200),
                lanes: [cursor('p1')],
                tasks: [shapeOf('a', ['p1'])],
                changed: [nowClosed, added],
                refused: [{ op: { op: 'close', id: factIdOf(typeIdAt(99)), why: 'done' }, reason: 'unknown-id' }],
            }),
        );
        assert.deepEqual(knownFacts(store.facts.allOf(TASK), 'allOf'), [goal, nowClosed, added]);
        assert.deepEqual(knownFacts(store.facts.openOf(TASK), 'openOf'), [added, goal]);
        assert.deepEqual(knownFacts(store.facts.recentlyClosed(TASK, instant(0)), 'recentlyClosed'), [nowClosed]);
    },
};

export const CARRIED_CASES: readonly Case<null, StoreUnderTest>[] = [REC_14];
