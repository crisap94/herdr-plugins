import assert from 'node:assert/strict';
import type { Engine } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { followed, key, scope, session } from '../ids.ts';
import type { Behaviour, EngineWorld, WrittenAnswer } from '../world.ts';
import { countOf, NO_OPS, recapOf, spoken } from './support.ts';
import { failure } from '../values.ts';

const TAB = scope('one');
const OTHER = scope('two');
const RUN_CALLS = new Set<string>(['beginRun', 'recordRun', 'failRun']);

const HELD: Behaviour<WrittenAnswer> = {
    kind: 'block',
    after: { kind: 'answer', value: { kind: 'written', text: JSON.stringify({ ops: [] }), costUsd: 0 } },
};

const FAILED = failure(1, 'scripted writer failure');

const runCalls = (world: EngineWorld): readonly string[] => world.store.calls().filter((call) => RUN_CALLS.has(call));

const settlesInOrder = (calls: readonly string[]): boolean => {
    let open = false;
    for (const call of calls) {
        if (call === 'beginRun') {
            if (open) {
                return false;
            }
            open = true;
        } else {
            if (!open) {
                return false;
            }
            open = false;
        }
    }
    return !open;
};

export const RUN_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'RUN-1',
        group: 'RUN',
        title: 'three requests for one scope while its writer is blocked: one writer call in flight, then exactly one more run',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(HELD);
            const first = engine.refresh(TAB);
            await world.settle();
            const second = engine.refresh(TAB);
            const third = engine.refresh(TAB);
            await world.settle();
            assert.equal(world.requests().length, 1);
            world.setWriter(NO_OPS);
            world.release();
            await Promise.all([first, second, third]);
            assert.equal(world.requests().length, 2);
            assert.equal(countOf(world, 'beginRun'), 2);
        },
    },
    {
        id: 'RUN-2',
        group: 'RUN',
        title: 'requests for two scopes: both writers are in flight at the same time',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.follow(OTHER, followed(key('b'), { session: session('s2') }));
            world.setRead(spoken('hello'));
            world.setWriter(HELD);
            const first = engine.refresh(TAB);
            const second = engine.refresh(OTHER);
            await world.settle();
            assert.equal(world.requests().length, 2);
            world.setWriter(NO_OPS);
            world.release();
            await Promise.all([first, second]);
        },
    },
    {
        id: 'RUN-3',
        group: 'RUN',
        title: 'every run that called beginRun: exactly one of recordRun or failRun follows before the next beginRun of the scope',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('one'));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            world.setRead(spoken('two'));
            world.setWriter({ kind: 'fail', why: FAILED });
            await engine.refresh(TAB);
            world.setRead(spoken('three'));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            const calls = runCalls(world);
            assert.equal(calls.filter((call) => call === 'beginRun').length, 3);
            assert.ok(settlesInOrder(calls));
        },
    },
    {
        id: 'RUN-4',
        group: 'RUN',
        title: 'the writer throws: failRun is called with the error text and readRecap(scope).running is false afterwards',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter({ kind: 'throw', message: 'boom' });
            await engine.refresh(TAB);
            assert.equal(countOf(world, 'failRun'), 1);
            const recap = recapOf(world, TAB);
            assert.ok(recap !== null && recap.error !== null && recap.error.includes('boom'));
            assert.equal(recap.running, false);
        },
    },
    {
        id: 'RUN-5',
        group: 'RUN',
        title: 'the reader read throws (a port bug) before the writer starts: the recap records a failed run with the error text, no beginRun is left open, and the throw is logged',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead({ kind: 'throw', message: 'boom' });
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.ok(settlesInOrder(runCalls(world)));
            assert.equal(countOf(world, 'failRun'), 1);
            const recap = recapOf(world, TAB);
            assert.ok(recap !== null && recap.error !== null && recap.error.includes('boom'));
            assert.equal(recap.running, false);
            assert.ok(world.lines().some((line) => line.includes('boom')));
        },
    },
    {
        id: 'RUN-6',
        group: 'RUN',
        title: 'recordRun throws: the slot is released so a later refresh starts a new run, and the throw is logged',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('one'));
            world.setWriter(NO_OPS);
            world.store.failRecords(1);
            await engine.refresh(TAB);
            assert.ok(world.lines().some((line) => line.includes('scripted recordRun failure')));
            world.setRead(spoken('two'));
            await engine.refresh(TAB);
            assert.equal(countOf(world, 'beginRun'), 2);
        },
    },
    {
        id: 'RUN-7',
        group: 'RUN',
        title: 'after a writer throw, a later refresh starts a new run',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('one'));
            world.setWriter({ kind: 'throw', message: 'boom' });
            await engine.refresh(TAB);
            world.setRead(spoken('two'));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.equal(countOf(world, 'beginRun'), 2);
            assert.equal(world.requests().length, 2);
        },
    },
    {
        id: 'RUN-8',
        group: 'RUN',
        title: 'a written run calls the store in the order readRecap, beginRun, recordRun',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.deepEqual(
                world.store.calls().filter((call) => call === 'readRecap' || RUN_CALLS.has(call)),
                ['readRecap', 'beginRun', 'recordRun'],
            );
        },
    },
];
