import assert from 'node:assert/strict';
import type { Engine, HistoryFact } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { factOf } from '../facts.ts';
import { followed, key, scope, session } from '../ids.ts';
import type { EngineWorld } from '../world.ts';
import { addOf, countOf, NO_OPS, spoken, writtenOps } from './support.ts';

const TAB = scope('one');
const OTHER = scope('two');
const WRITES: readonly string[] = ['beginRun', 'recordRun', 'failRun', 'advance', 'apply'];

const writesOf = (world: EngineWorld): number => WRITES.reduce((sum, name) => sum + countOf(world, name), 0);

const runWritten = async (world: EngineWorld, engine: Engine, text: string): Promise<void> => {
    engine.follow(TAB, followed(key('a'), { session: session('s1') }));
    world.setRead(spoken('hello'));
    world.setWriter(writtenOps([addOf('now', text)]));
    engine.turnEnded(TAB, key('a'), 'requested');
    await world.settle();
};

const seedHistory = (world: EngineWorld): void => {
    world.store.seed(null, [
        factOf('fct_1', { task: { tab: TAB, key: key('a') }, text: 'stored fact', firstAt: 1, lastAt: 1 }),
        factOf('fct_2', { task: { tab: TAB, key: key('a') }, text: 'closed fact', state: 'closed', closedWhy: 'done', closedAt: 2, firstAt: 1, lastAt: 2 }),
    ]);
};

const hasText = (facts: readonly HistoryFact[], text: string): boolean => facts.some((fact) => fact.text === text);

export const HIS_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'HIS-1',
        group: 'HIS',
        title: 'history after a written run equals the store history of the key',
        level: 'full',
        async run(world, engine) {
            seedHistory(world);
            await runWritten(world, engine, 'history fact');
            const stored = world.store.facts.historyOf(TAB, key('a'));
            assert.ok(stored.length > 0);
            assert.deepEqual(engine.history(TAB, key('a')), stored);
        },
    },
    {
        id: 'HIS-2',
        group: 'HIS',
        title: 'history for a key that was unfollowed returns the same facts as before',
        level: 'full',
        async run(world, engine) {
            seedHistory(world);
            await runWritten(world, engine, 'history fact');
            const before = engine.history(TAB, key('a'));
            assert.ok(before.length > 0);
            engine.unfollow(TAB, key('a'));
            assert.deepEqual(engine.history(TAB, key('a')), before);
        },
    },
    {
        id: 'HIS-3',
        group: 'HIS',
        title: 'history for an unknown scope or key is empty',
        level: 'surface',
        run(_world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            assert.deepEqual(engine.history(TAB, key('zz')), []);
            assert.deepEqual(engine.history(OTHER, key('a')), []);
            return Promise.resolve();
        },
    },
    {
        id: 'HIS-4',
        group: 'HIS',
        title: 'history alone is synchronous and calls no reader, no writer and no store write',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            await world.settle();
            const located = world.located().length;
            const reads = world.reads().length;
            const requests = world.requests().length;
            const writes = writesOf(world);
            const result = engine.history(TAB, key('a'));
            assert.equal(Array.isArray(result), true);
            assert.equal(world.located().length, located);
            assert.equal(world.reads().length, reads);
            assert.equal(world.requests().length, requests);
            assert.equal(writesOf(world), writes);
        },
    },
    {
        id: 'HIS-5',
        group: 'HIS',
        title: 'after a rebind the facts recorded under the old session id are still returned',
        level: 'full',
        async run(world, engine) {
            seedHistory(world);
            await runWritten(world, engine, 'old session fact');
            assert.ok(hasText(engine.history(TAB, key('a')), 'stored fact'));
            engine.sessionStarted(TAB, key('a'), { session: session('s2'), cwd: null });
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.equal(world.located().at(-1)?.session, session('s2'));
            assert.ok(hasText(engine.history(TAB, key('a')), 'stored fact'));
        },
    },
];
