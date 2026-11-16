import assert from 'node:assert/strict';
import type { Engine, Fact } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { factOf } from '../facts.ts';
import { followed, key, scope, session } from '../ids.ts';
import type { Behaviour, CuratedAnswer, EngineWorld } from '../world.ts';
import { addOf, blockedOps, countOf, spoken, writtenOps } from './support.ts';

const TAB = scope('one');
const TASK = { tab: TAB, key: key('a') };
const WRITES: readonly string[] = ['beginRun', 'recordRun', 'failRun', 'advance', 'apply'];

const CURATED: Behaviour<CuratedAnswer> = { kind: 'answer', value: { kind: 'curated', text: 'curated story' } };
const UNKNOWN: Behaviour<CuratedAnswer> = { kind: 'fail', why: { why: 'failed', code: 1, detail: 'scripted curator failure' } };
const THROWS: Behaviour<CuratedAnswer> = { kind: 'throw', message: 'boom' };

const writesOf = (world: EngineWorld): number => WRITES.reduce((sum, name) => sum + countOf(world, name), 0);

const factsOf = (world: EngineWorld): readonly Fact[] => {
    const found = world.store.facts.allOf(TASK);
    return 'kind' in found ? [] : found;
};

const seedFacts = (world: EngineWorld): void => {
    world.store.seed(null, [factOf('fct_1', { task: TASK, text: 'open work', firstAt: 1, lastAt: 1 })]);
};

const seedOpen = async (world: EngineWorld, engine: Engine): Promise<void> => {
    seedFacts(world);
    engine.follow(TAB, followed(key('a'), { session: session('s1') }));
    world.setRead(spoken('hello'));
    world.setWriter(writtenOps([addOf('now', 'open work')]));
    engine.turnEnded(TAB, key('a'), 'requested');
    await world.settle();
};

export const CUR_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'CUR-1',
        group: 'CUR',
        title: 'curate with no curator plug resolves with no store write',
        level: 'full',
        async run(world, engine) {
            await seedOpen(world, engine);
            const writes = writesOf(world);
            await engine.curate(TAB);
            await world.settle();
            assert.equal(writesOf(world), writes);
        },
    },
    {
        id: 'CUR-2',
        group: 'CUR',
        title: 'curate on a scope with no recap does not call the curator',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setCurator(CURATED);
            await engine.curate(TAB);
            await world.settle();
            assert.equal(world.curated().length, 0);
        },
    },
    {
        id: 'CUR-3',
        group: 'CUR',
        title: 'curate on a scope with one task that has open facts calls the curator for it',
        level: 'full',
        async run(world, engine) {
            await seedOpen(world, engine);
            world.setCurator(CURATED);
            const before = world.curated().length;
            await engine.curate(TAB);
            await world.settle();
            assert.ok(world.curated().length > before);
        },
    },
    {
        id: 'CUR-4',
        group: 'CUR',
        title: 'the curator returns Unknown: curate resolves, logs one line and leaves the facts unchanged',
        level: 'full',
        async run(world, engine) {
            await seedOpen(world, engine);
            world.setCurator(UNKNOWN);
            const before = world.curated().length;
            const lines = world.lines().length;
            const facts = factsOf(world);
            await engine.curate(TAB);
            await world.settle();
            assert.equal(world.curated().length, before + 1);
            assert.equal(world.lines().length, lines + 1);
            assert.deepEqual(factsOf(world), facts);
        },
    },
    {
        id: 'CUR-5',
        group: 'CUR',
        title: 'the curator throws: curate resolves and logs one line',
        level: 'full',
        async run(world, engine) {
            await seedOpen(world, engine);
            world.setCurator(THROWS);
            const before = world.curated().length;
            const lines = world.lines().length;
            await engine.curate(TAB);
            await world.settle();
            assert.equal(world.curated().length, before + 1);
            assert.equal(world.lines().length, lines + 1);
        },
    },
    {
        id: 'CUR-6',
        group: 'CUR',
        title: 'curate while a run is in flight: both finish and the facts the run writes are kept',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(blockedOps([addOf('now', 'late work')]));
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 1);
            seedFacts(world);
            const facts = factsOf(world);
            world.setCurator(CURATED);
            const before = world.curated().length;
            const curating = engine.curate(TAB);
            world.release();
            await curating;
            await world.settle();
            assert.equal(countOf(world, 'recordRun'), 1);
            assert.equal(world.curated().length, before + 1);
            assert.deepEqual(factsOf(world), facts);
        },
    },
    {
        id: 'CUR-7',
        group: 'CUR',
        title: 'a failed readRecap during curate: curate resolves and the curator is not called',
        level: 'full',
        async run(world, engine) {
            await seedOpen(world, engine);
            world.setCurator(CURATED);
            const before = world.curated().length;
            await engine.curate(TAB);
            await world.settle();
            assert.equal(world.curated().length, before + 1);
            world.store.failReads('readRecap', 1);
            const failed = world.curated().length;
            await engine.curate(TAB);
            await world.settle();
            assert.equal(world.curated().length, failed);
        },
    },
];
