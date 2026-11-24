import assert from 'node:assert/strict';
import type { Engine, Recap } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { factOf } from '../facts.ts';
import { followed, key, scope, session } from '../ids.ts';
import type { Behaviour, EngineWorld, WrittenAnswer } from '../world.ts';
import { countOf, NO_OPS, quietAt, recapOf, spoken } from './support.ts';
import { failure, running, usd, text, tabId } from '../values.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { textOf } from '../../src/recap/domain/text.ts';
import { tabIdOf, paneIdOf } from '../../src/recap/domain/lane-shape.ts';

const TAB = scope('one');
const FAILED = failure(1, 'scripted writer failure');
const WRITE_CALLS = new Set<string>(['beginRun', 'recordRun', 'failRun', 'advance', 'apply']);

const failWriter: Behaviour<WrittenAnswer> = { kind: 'fail', why: FAILED };

const writesOf = (world: EngineWorld): readonly string[] => world.store.calls().filter((call) => WRITE_CALLS.has(call));

const written = (world: EngineWorld, factLanguage: string): void => {
    const recap: Recap = {
        scope: tabId('one'),
        sessions: [],
        tasks: [{ id: textOf('t1'), name: textOf('work'), sessions: [paneIdOf(key('a'))], sections: null, markdown: textOf('editing src/app.ts v2') }],
        at: instant(0),
        running: running(false),
        backend: null,
        error: null,
        costUsd: usd(0),
        language: text('en'),
    };
    world.store.seed(recap, [factOf('fct_1', { task: { scope: tabIdOf(TAB), key: textOf('t1') }, text: textOf('editing src/app.ts v2'), language: textOf(factLanguage) })]);
};

export const LNG_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'LNG-1',
        group: 'LNG',
        title: 'a written run stores the language setting',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setLanguage('es');
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.equal(recapOf(world, TAB)?.language, 'es');
        },
    },
    {
        id: 'LNG-2',
        group: 'LNG',
        title: 'a failed run keeps the language of the last written run',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('one'));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            world.setLanguage('es');
            world.setRead(spoken('two'));
            world.setWriter(failWriter);
            await engine.refresh(TAB);
            assert.equal(recapOf(world, TAB)?.language, 'en');
        },
    },
    {
        id: 'LNG-3',
        group: 'LNG',
        title: 'a language switch with a quiet chunk still starts a run',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            written(world, 'en');
            world.setLanguage('es');
            world.setRead(quietAt(0));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.equal(countOf(world, 'beginRun'), 1);
            assert.equal(recapOf(world, TAB)?.language, 'es');
        },
    },
    {
        id: 'LNG-4',
        group: 'LNG',
        title: 'a focused turn end with nothing grown and no language switch writes nothing',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            written(world, 'en');
            world.setRead(quietAt(0));
            world.setWriter(NO_OPS);
            engine.turnEnded(TAB, key('a'), 'focused');
            await world.settle();
            assert.deepEqual(writesOf(world), []);
            assert.equal(world.requests().length, 0);
        },
    },
    {
        id: 'LNG-5',
        group: 'LNG',
        title: 'a focused turn end with an open fact in an old language and the recap language current does not rewrite the recap',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            written(world, 'es');
            world.setRead(quietAt(0));
            world.setWriter(NO_OPS);
            engine.turnEnded(TAB, key('a'), 'focused');
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 0);
            assert.equal(world.requests().length, 0);
        },
    },
    {
        id: 'LNG-6',
        group: 'LNG',
        title: 'a requested turn end with an open fact in a stale language rewrites it, naming the previous language',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            written(world, 'es');
            world.setRead(quietAt(0));
            world.setWriter(NO_OPS);
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 1);
            assert.equal(world.requests().at(-1)?.previousLanguage, 'es');
        },
    },
    {
        id: 'LNG-7',
        group: 'LNG',
        title: 'runs before and after a language change send each language to the writer',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('one'));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            world.setLanguage('es');
            world.setRead(spoken('two'));
            await engine.refresh(TAB);
            assert.deepEqual(world.requests().map((request) => request.language), ['en', 'es']);
        },
    },
];
