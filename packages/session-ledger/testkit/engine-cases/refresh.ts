import assert from 'node:assert/strict';
import { UNREAD, type Chunk, type Engine } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { followed, key, scope, session } from '../ids.ts';
import type { Behaviour, EngineWorld, WrittenAnswer } from '../world.ts';
import { causeOf, countOf, NO_OPS, spoken } from './support.ts';
import { failure, grew } from '../values.ts';

const SCOPE = scope('one');
const OTHER = scope('two');

const quietOf = (): Behaviour<Chunk> => ({
    kind: 'answer',
    value: { kind: 'chunk', entries: [], title: null, lastPrompt: null, harnessRecap: null, notes: [], position: UNREAD, grew: grew(false) },
});

const FAILED = failure(1, 'scripted writer failure');

const HELD: Behaviour<WrittenAnswer> = {
    kind: 'block',
    after: { kind: 'answer', value: { kind: 'written', text: JSON.stringify({ ops: [] }), costUsd: 0 } },
};

export const REF_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'REF-1',
        group: 'REF',
        title: 'refresh with new entries resolves after recordRun, with cause requested',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            await engine.refresh(SCOPE);
            assert.equal(countOf(world, 'recordRun'), 1);
            assert.equal(causeOf(world, SCOPE), 'requested');
        },
    },
    {
        id: 'REF-2',
        group: 'REF',
        title: 'refresh with nothing new resolves after advance and starts no run',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            world.setRead(quietOf());
            world.setWriter(NO_OPS);
            await engine.refresh(SCOPE);
            assert.equal(countOf(world, 'advance'), 1);
            assert.equal(countOf(world, 'beginRun'), 0);
        },
    },
    {
        id: 'REF-3',
        group: 'REF',
        title: 'the writer returns Unknown: refresh resolves and failRun is called',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter({ kind: 'fail', why: FAILED });
            await engine.refresh(SCOPE);
            assert.equal(countOf(world, 'failRun'), 1);
        },
    },
    {
        id: 'REF-4',
        group: 'REF',
        title: 'refresh on a scope that follows nothing starts no run and calls no writer',
        level: 'surface',
        async run(world, engine) {
            await engine.refresh(OTHER);
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 0);
            assert.equal(world.requests().length, 0);
        },
    },
    {
        id: 'REF-5',
        group: 'REF',
        title: 'two refresh calls before the run starts make one run and both resolve',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            const first = engine.refresh(SCOPE);
            const second = engine.refresh(SCOPE);
            await Promise.all([first, second]);
            assert.equal(countOf(world, 'beginRun'), 1);
        },
    },
    {
        id: 'REF-6',
        group: 'REF',
        title: 'refresh while a run is in flight resolves only after a later run',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('one'));
            world.setWriter(HELD);
            const first = engine.refresh(SCOPE);
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 1);
            world.setRead(spoken('two'));
            const second = engine.refresh(SCOPE);
            const outcome = await Promise.race([second.then(() => 'done'), world.settle().then(() => 'pending')]);
            assert.equal(outcome, 'pending');
            world.release();
            await Promise.all([first, second]);
            assert.equal(countOf(world, 'beginRun'), 2);
            assert.equal(countOf(world, 'recordRun'), 2);
        },
    },
    {
        id: 'REF-7',
        group: 'REF',
        title: 'the writer throws: refresh resolves and never rejects',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter({ kind: 'throw', message: 'boom' });
            await engine.refresh(SCOPE);
        },
    },
    {
        id: 'REF-8',
        group: 'REF',
        title: 'refresh in scope A resolves without waiting for a blocked run in scope B',
        level: 'full',
        async run(world, engine) {
            engine.follow(SCOPE, followed(key('a'), { session: session('s1') }));
            engine.follow(OTHER, followed(key('b'), { session: session('s2') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            world.setLocate((found) =>
                found.key === key('b')
                    ? { kind: 'block', after: { kind: 'answer', value: { kind: 'located', source: 'b' } } }
                    : { kind: 'answer', value: { kind: 'located', source: found.key } },
            );
            const other = engine.refresh(OTHER);
            const first = engine.refresh(SCOPE).then(() => 'done');
            const outcome = await Promise.race([first, world.settle().then(() => 'pending')]);
            assert.equal(outcome, 'done');
            world.release();
            await Promise.all([first, other]);
        },
    },
];
