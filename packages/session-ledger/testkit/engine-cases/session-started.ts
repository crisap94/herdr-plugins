import assert from 'node:assert/strict';
import { UNREAD, type Engine, type FollowedSession } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { directory, followed, harness, key, scope, session } from '../ids.ts';
import type { EngineWorld } from '../world.ts';
import { cursorsOf } from './support.ts';
import { cursorAt, grew, text } from '../values.ts';

const SCOPE = scope('one');
const CLAUDE = harness('claude');

const lastLocated = (world: EngineWorld): FollowedSession | undefined => world.located().at(-1);

const countOf = (world: EngineWorld, call: string): number => world.store.calls().filter((item) => item === call).length;

export const STA_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'STA-1',
        group: 'STA',
        title: 'sessionStarted rebinds the key to the new session, then refresh locates the new one',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            engine.sessionStarted(SCOPE, key('a'), { session: session('s2'), cwd: null });
            await engine.refresh(SCOPE);
            assert.equal(lastLocated(world)?.session, session('s2'));
        },
    },
    {
        id: 'STA-2',
        group: 'STA',
        title: 'after a rebind, followedBy finds the new id and not the old one',
        level: 'surface',
        run(_world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            engine.sessionStarted(SCOPE, key('a'), { session: session('s2'), cwd: null });
            assert.deepEqual(engine.followedBy(CLAUDE, session('s2')), { scope: SCOPE, key: key('a') });
            assert.equal(engine.followedBy(CLAUDE, session('s1')), null);
            return Promise.resolve();
        },
    },
    {
        id: 'STA-3',
        group: 'STA',
        title: 'sessionStarted schedules a read without a turn ended call',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            engine.sessionStarted(SCOPE, key('a'), { session: session('s2'), cwd: null });
            await world.settle();
            assert.equal(lastLocated(world)?.session, session('s2'));
        },
    },
    {
        id: 'STA-4',
        group: 'STA',
        title: 'sessionStarted on a new empty session runs advance only',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            engine.sessionStarted(SCOPE, key('a'), { session: session('s2'), cwd: null });
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 0);
            assert.equal(countOf(world, 'advance'), 1);
            assert.deepEqual(world.requests(), []);
        },
    },
    {
        id: 'STA-5',
        group: 'STA',
        title: 'sessionStarted with no session id unbinds the key',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            engine.sessionStarted(SCOPE, key('a'), { session: null, cwd: null });
            assert.equal(engine.followedBy(CLAUDE, session('s1')), null);
            await engine.refresh(SCOPE);
            assert.equal(lastLocated(world)?.session, null);
        },
    },
    {
        id: 'STA-6',
        group: 'STA',
        title: 'sessionStarted with a new cwd replaces the cwd and keeps the session id',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1'), cwd: directory('/old') }));
            engine.sessionStarted(SCOPE, key('a'), { session: session('s1'), cwd: directory('/new') });
            await engine.refresh(SCOPE);
            assert.deepEqual(lastLocated(world), followed(key('a'), { session: session('s1'), cwd: directory('/new') }));
        },
    },
    {
        id: 'STA-7',
        group: 'STA',
        title: 'sessionStarted for a key that is not followed',
        level: 'full',
        async run(world, engine) {
            engine.sessionStarted(SCOPE, key('ghost'), { session: session('s2'), cwd: null });
            await world.settle();
            assert.equal(world.lines().length, 1);
            assert.deepEqual(world.located(), []);
            assert.equal(engine.followedBy(CLAUDE, session('s2')), null);
        },
    },
    {
        id: 'STA-8',
        group: 'STA',
        title: 'rebinding keeps the cursor of the old source',
        level: 'full',
        async run(world, engine) {
            world.setLocate((followedSession) => ({ kind: 'answer', value: { kind: 'located', source: followedSession.session ?? followedSession.key } }));
            world.setRead({
                kind: 'answer',
                value: { kind: 'chunk', entries: [], title: null, lastPrompt: null, harnessRecap: null, notes: [], position: { cursor: cursorAt(5), tail: null }, grew: grew(true) },
            });
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            await engine.refresh(SCOPE);
            engine.sessionStarted(SCOPE, key('a'), { session: session('s2'), cwd: null });
            await engine.refresh(SCOPE);
            assert.deepEqual(world.reads(), ['s1', 's2']);
            assert.deepEqual(world.positions().at(-1), UNREAD);
            assert.ok(cursorsOf(world, SCOPE).some((cursor) => cursor.key === 'a' && cursor.transcript === 's1' && cursor.cursor === 5));
        },
    },
    {
        id: 'STA-9',
        group: 'STA',
        title: 'the rebound key is still followed after a title is given at follow',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1'), title: text('kept') }));
            engine.sessionStarted(SCOPE, key('a'), { session: session('s2'), cwd: null });
            await engine.refresh(SCOPE);
            assert.equal(lastLocated(world)?.session, session('s2'));
            assert.equal(lastLocated(world)?.title, 'kept');
        },
    },
    {
        id: 'STA-10',
        group: 'STA',
        title: 'a key followed then started with no turn ended or refresh counts as followed',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            engine.sessionStarted(SCOPE, key('a'), { session: session('s2'), cwd: null });
            await world.settle();
            assert.equal(world.lines().some((line) => line.includes('not followed')), false);
            assert.equal(lastLocated(world)?.session, session('s2'));
        },
    },
];
