import assert from 'node:assert/strict';
import type { Debounce, Engine, SessionKey } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { duration, followed, key, scope, session } from '../ids.ts';
import type { EngineWorld } from '../world.ts';
import { causeOf, countOf, NO_OPS, spoken } from './support.ts';

const SCOPE = scope('one');
const SOLO = scope('solo');

const locatedKeys = (world: EngineWorld): SessionKey[] => world.located().map((item) => item.key).toSorted();

const WINDOW: Debounce = { kind: 'window', window: duration(60_000) };

export const TRN_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'TRN-1',
        group: 'TRN',
        title: 'turn-ended for one key reads every followed session of the scope',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            engine.follow(SCOPE, followed(key('b'), { session: session('s2') }));
            engine.turnEnded(SCOPE, key('a'), 'requested');
            await world.settle();
            assert.deepEqual(locatedKeys(world), [key('a'), key('b')]);
        },
    },
    {
        id: 'TRN-2',
        group: 'TRN',
        title: 'turn-ended with no key and cause focused runs the same read with cause focused',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            engine.follow(SCOPE, followed(key('b'), { session: session('s2') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            engine.turnEnded(SCOPE, null, 'focused');
            await world.settle();
            assert.deepEqual(locatedKeys(world), [key('a'), key('b')]);
            assert.equal(causeOf(world, SCOPE), 'focused');
        },
    },
    {
        id: 'TRN-3',
        group: 'TRN',
        title: 'turn-ended with a key that is not followed',
        level: 'full',
        async run(world, engine) {
            engine.turnEnded(SCOPE, key('ghost'), 'requested');
            await world.settle();
            assert.deepEqual(world.located(), []);
            assert.deepEqual(world.requests(), []);
            assert.equal(world.store.calls().length, 0);
            assert.equal(world.lines().length, 1);
            assert.ok(world.lines()[0]?.includes('ghost'));
        },
    },
    {
        id: 'TRN-4',
        group: 'TRN',
        title: 'turn-ended on a scope that follows nothing',
        level: 'full',
        async run(world, engine) {
            engine.turnEnded(SOLO, null, 'requested');
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 0);
            assert.deepEqual(world.requests(), []);
        },
    },
    {
        id: 'TRN-5',
        group: 'TRN',
        title: 'turn-ended returns before any read',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            const returned: unknown = engine.turnEnded(SCOPE, key('a'), 'requested');
            assert.equal(returned, undefined);
            assert.deepEqual(world.reads(), []);
            await world.settle();
            assert.deepEqual(world.reads(), ['a']);
        },
    },
    {
        id: 'TRN-6',
        group: 'TRN',
        title: 'turn-ended twice inside the settle time runs once',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            world.setDebounce(WINDOW);
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            engine.turnEnded(SCOPE, key('a'), 'turn-ended');
            engine.turnEnded(SCOPE, key('a'), 'turn-ended');
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 1);
        },
    },
    {
        id: 'TRN-7',
        group: 'TRN',
        title: 'requested then turn-ended before the run starts keeps cause requested',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            world.setDebounce(WINDOW);
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            engine.turnEnded(SCOPE, null, 'focused');
            await world.settle();
            engine.turnEnded(SCOPE, key('a'), 'requested');
            engine.turnEnded(SCOPE, key('a'), 'turn-ended');
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 2);
            assert.equal(causeOf(world, SCOPE), 'requested');
        },
    },
    {
        id: 'TRN-8',
        group: 'TRN',
        title: 'turn-ended with new user entries for the key records the turn',
        level: 'full',
        async run(world, engine) {
            world.setDebounce(WINDOW);
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            engine.turnEnded(SCOPE, key('a'), 'turn-ended');
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 1);
            assert.ok(world.events().some((item) => item.kind === 'turn-recorded' && item.key === key('a')));
        },
    },
];
