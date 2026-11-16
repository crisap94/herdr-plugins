import assert from 'node:assert/strict';
import type { Case } from '../run.ts';
import type { Engine } from '@stateforge-labs/session-ledger';
import { directory, followed, key, scope, session } from '../ids.ts';
import type { EngineWorld } from '../world.ts';
import { panesOf } from './support.ts';

const TAB = scope('one');
const OTHER = scope('two');

export const FOL_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'FOL-1',
        group: 'FOL',
        title: 'follow one session, then refresh',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            await engine.refresh(TAB);
            assert.deepEqual(world.located(), [followed(key('a'), { session: session('s1') })]);
        },
    },
    {
        id: 'FOL-2',
        group: 'FOL',
        title: 'follow A, B, C, then refresh',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.follow(TAB, followed(key('b'), { session: session('s2') }));
            engine.follow(TAB, followed(key('c'), { session: session('s3') }));
            await engine.refresh(TAB);
            assert.deepEqual(world.reads(), ['a', 'b', 'c']);
            assert.deepEqual(panesOf(world, TAB), ['a', 'b', 'c']);
        },
    },
    {
        id: 'FOL-3',
        group: 'FOL',
        title: 'follow an existing key with a new session id, cwd or title',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1'), cwd: directory('/one'), title: 'one' }));
            engine.follow(TAB, followed(key('b'), { session: session('s2') }));
            engine.follow(TAB, followed(key('a'), { session: session('s9'), cwd: directory('/nine'), title: 'nine' }));
            await engine.refresh(TAB);
            assert.deepEqual(world.located(), [
                followed(key('a'), { session: session('s9'), cwd: directory('/nine'), title: 'nine' }),
                followed(key('b'), { session: session('s2') }),
            ]);
        },
    },
    {
        id: 'FOL-4',
        group: 'FOL',
        title: 'follow the same session twice, unchanged',
        level: 'surface',
        run(_world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.unfollow(TAB, key('a'));
            assert.equal(engine.followedBy(followed(key('a')).harness, session('s1')), null);
            return Promise.resolve();
        },
    },
    {
        id: 'FOL-5',
        group: 'FOL',
        title: 'unfollow a key, then refresh',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.follow(TAB, followed(key('b'), { session: session('s2') }));
            engine.unfollow(TAB, key('a'));
            await engine.refresh(TAB);
            assert.deepEqual(world.located(), [followed(key('b'), { session: session('s2') })]);
            assert.deepEqual(world.reads(), ['b']);
        },
    },
    {
        id: 'FOL-6',
        group: 'FOL',
        title: 'unfollow a key, then follow it again',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.follow(TAB, followed(key('b'), { session: session('s2') }));
            engine.unfollow(TAB, key('a'));
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            await engine.refresh(TAB);
            assert.deepEqual(world.reads(), ['b', 'a']);
        },
    },
    {
        id: 'FOL-7',
        group: 'FOL',
        title: 'unfollow a key that was never followed',
        level: 'surface',
        run(_world, engine) {
            assert.doesNotThrow(() => {
                engine.unfollow(TAB, key('ghost'));
            });
            return Promise.resolve();
        },
    },
    {
        id: 'FOL-8',
        group: 'FOL',
        title: 'the same key followed in two scopes',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.follow(OTHER, followed(key('a'), { session: session('s1') }));
            engine.unfollow(TAB, key('a'));
            await engine.refresh(TAB);
            assert.deepEqual(world.located(), []);
            await engine.refresh(OTHER);
            assert.deepEqual(world.located(), [followed(key('a'), { session: session('s1') })]);
        },
    },
    {
        id: 'FOL-9',
        group: 'FOL',
        title: 'follow alone',
        level: 'full',
        run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            assert.deepEqual(world.store.calls(), []);
            assert.deepEqual(world.located(), []);
            assert.deepEqual(world.requests(), []);
            assert.deepEqual(world.events(), []);
            return Promise.resolve();
        },
    },
    {
        id: 'FOL-10',
        group: 'FOL',
        title: 'unfollow the last session of a scope',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            await engine.refresh(TAB);
            const before = panesOf(world, TAB);
            const calls = world.store.calls().length;
            engine.unfollow(TAB, key('a'));
            assert.equal(world.store.calls().length, calls);
            assert.deepEqual(panesOf(world, TAB), before);
        },
    },
];
