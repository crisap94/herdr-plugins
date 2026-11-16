import assert from 'node:assert/strict';
import type { Engine } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { directory, followed, harness, key, scope, session } from '../ids.ts';
import type { EngineWorld } from '../world.ts';

const TAB = scope('one');
const OTHER = scope('two');
const CLAUDE = harness('claude');

export const FBY_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'FBY-1',
        group: 'FBY',
        title: 'a followed session with a known id',
        level: 'surface',
        run(_world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            assert.deepEqual(engine.followedBy(CLAUDE, session('s1')), { scope: TAB, key: key('a') });
            return Promise.resolve();
        },
    },
    {
        id: 'FBY-2',
        group: 'FBY',
        title: 'an id nobody follows',
        level: 'surface',
        run(_world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            assert.equal(engine.followedBy(CLAUDE, session('s9')), null);
            return Promise.resolve();
        },
    },
    {
        id: 'FBY-3',
        group: 'FBY',
        title: 'the right id with another harness',
        level: 'surface',
        run(_world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            assert.equal(engine.followedBy(harness('codex'), session('s1')), null);
            return Promise.resolve();
        },
    },
    {
        id: 'FBY-4',
        group: 'FBY',
        title: 'two sessions with the same cwd and different ids',
        level: 'surface',
        run(_world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1'), cwd: directory('/same') }));
            engine.follow(TAB, followed(key('b'), { session: session('s2'), cwd: directory('/same') }));
            assert.deepEqual(engine.followedBy(CLAUDE, session('s1')), { scope: TAB, key: key('a') });
            assert.deepEqual(engine.followedBy(CLAUDE, session('s2')), { scope: TAB, key: key('b') });
            return Promise.resolve();
        },
    },
    {
        id: 'FBY-5',
        group: 'FBY',
        title: 'a session after unfollow',
        level: 'surface',
        run(_world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.unfollow(TAB, key('a'));
            assert.equal(engine.followedBy(CLAUDE, session('s1')), null);
            return Promise.resolve();
        },
    },
    {
        id: 'FBY-6',
        group: 'FBY',
        title: 'a follow that replaced the session id',
        level: 'surface',
        run(_world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.follow(TAB, followed(key('a'), { session: session('s9') }));
            assert.deepEqual(engine.followedBy(CLAUDE, session('s9')), { scope: TAB, key: key('a') });
            assert.equal(engine.followedBy(CLAUDE, session('s1')), null);
            return Promise.resolve();
        },
    },
    {
        id: 'FBY-7',
        group: 'FBY',
        title: 'a followed session whose session is null',
        level: 'surface',
        run(_world, engine) {
            engine.follow(TAB, followed(key('a'), { session: null }));
            assert.equal(engine.followedBy(CLAUDE, session('s1')), null);
            return Promise.resolve();
        },
    },
    {
        id: 'FBY-8',
        group: 'FBY',
        title: 'the same harness and id followed in two scopes',
        level: 'surface',
        run(_world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.follow(OTHER, followed(key('b'), { session: session('s1') }));
            assert.deepEqual(engine.followedBy(CLAUDE, session('s1')), { scope: OTHER, key: key('b') });
            return Promise.resolve();
        },
    },
    {
        id: 'FBY-9',
        group: 'FBY',
        title: 'followedBy alone',
        level: 'full',
        run(world, engine) {
            const found: unknown = engine.followedBy(CLAUDE, session('s1'));
            assert.equal(found, null);
            assert.deepEqual(world.store.calls(), []);
            assert.deepEqual(world.reads(), []);
            assert.deepEqual(world.located(), []);
            return Promise.resolve();
        },
    },
];
