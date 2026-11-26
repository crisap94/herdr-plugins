import assert from 'node:assert/strict';
import { UNREAD, type Chunk, type Engine } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { directory, followed, key, scope, session } from '../ids.ts';
import type { Behaviour, EngineWorld } from '../world.ts';
import { NO_OPS, spoken } from './support.ts';
import { grew, text } from '../values.ts';

const SCOPE = scope('one');
const BUDGET = Math.floor(786432 / 3);

const HELD_READ: Behaviour<Chunk> = {
    kind: 'block',
    after: {
        kind: 'answer',
        value: { kind: 'chunk', entries: [{ role: 'user', text: text('hello') }], title: null, lastPrompt: text('hello'), harnessRecap: null, notes: [], position: UNREAD, grew: grew(true) },
    },
};

const followThree = (engine: Engine): void => {
    engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
    engine.follow(SCOPE, followed(key('b'), { session: session('s2') }));
    engine.follow(SCOPE, followed(key('c'), { session: session('s3') }));
};

export const PRT_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'PRT-1',
        group: 'PRT',
        title: 'three followed sessions: each read gets the budget floor(786432 / 3)',
        level: 'full',
        async run(world, engine) {
            followThree(engine);
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            await engine.refresh(SCOPE);
            assert.deepEqual(world.budgets(), [BUDGET, BUDGET, BUDGET]);
        },
    },
    {
        id: 'PRT-2',
        group: 'PRT',
        title: 'one run: read is called once per session and models.writer() is resolved once',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            await engine.refresh(SCOPE);
            assert.equal(world.reads().length, 1);
            assert.equal(world.writerResolutions(), 1);
        },
    },
    {
        id: 'PRT-3',
        group: 'PRT',
        title: 'reads of one run: all read calls start before any resolves',
        level: 'full',
        async run(world, engine) {
            followThree(engine);
            world.setReadBySource(() => HELD_READ);
            world.setWriter(NO_OPS);
            const pending = engine.refresh(SCOPE);
            await world.settle();
            assert.equal(world.reads().length, 3);
            world.release();
            await pending;
        },
    },
    {
        id: 'PRT-4',
        group: 'PRT',
        title: 'keepInput returns false: recordRun carries no input',
        level: 'full',
        async run(world, engine) {
            world.setKeepInput(() => false);
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            await engine.refresh(SCOPE);
            const runs = world.store.recorded();
            assert.ok(runs.length >= 1);
            assert.ok(runs.every((run) => run.input === undefined));
        },
    },
    {
        id: 'PRT-5',
        group: 'PRT',
        title: 'a session in a git repository and one outside: repoOf is called with each cwd, and a session with cwd null is not asked',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1'), cwd: directory('/work/repo') }));
            engine.follow(SCOPE, followed(key('b'), { session: session('s2'), cwd: directory('/work/outside') }));
            engine.follow(SCOPE, followed(key('c'), { session: session('s3'), cwd: null }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            await engine.refresh(SCOPE);
            assert.deepEqual([...new Set(world.repoCalls())].toSorted(), ['/work/outside', '/work/repo']);
        },
    },
    {
        id: 'PRT-6',
        group: 'PRT',
        title: 'every at written to the store comes from environment.clock',
        level: 'full',
        async run(world, engine) {
            world.clock.set(7000);
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            await engine.refresh(SCOPE);
            const runs = world.store.recorded();
            assert.ok(runs.length >= 1);
            assert.ok(runs.every((run) => run.at === 7000));
            const recap = world.store.records.readRecap(SCOPE);
            assert.ok(recap !== null && !('kind' in recap));
            assert.equal(recap.at, 7000);
            assert.ok(world.store.marksOf(SCOPE).every((mark) => mark.at === 7000));
        },
    },
];
