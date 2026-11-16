import assert from 'node:assert/strict';
import { UNREAD, type Engine } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { followed, key, scope, session } from '../ids.ts';
import type { EngineWorld } from '../world.ts';
import { addOf, countOf, cursorsOf, NO_OPS, recapOf, spoken, chunkAt, quietAt, writtenOps } from './support.ts';

const TAB = scope('one');
const SCRIPT_FAILED = 1000;

const runCount = (world: EngineWorld): number => countOf(world, 'beginRun');

const keysOfTab = (world: EngineWorld): readonly string[] => {
    const found = world.store.facts.keysOf(TAB);
    if ('kind' in found) {
        throw new Error('keysOf is unknown');
    }
    return found;
};

const assertSkipped = (world: EngineWorld): void => {
    assert.equal(world.reads().length, 0);
    assert.equal(runCount(world), 0);
    assert.equal(countOf(world, 'advance'), 0);
    assert.equal(world.requests().length, 0);
    assert.equal(world.lines().length, 1);
};

export const RDF_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'RDF-1',
        group: 'RDF',
        title: 'readRecap returns Unknown: the run is skipped with no reader call, no beginRun, no advance, no writer call, and one log line',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            world.store.failReads('readRecap', SCRIPT_FAILED);
            await engine.refresh(TAB);
            assertSkipped(world);
        },
    },
    {
        id: 'RDF-2',
        group: 'RDF',
        title: 'after a readRecap failure, a refresh with a working store keeps the cursors, language and task keys from before the failure, and adds no task key',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(chunkAt(3));
            world.setWriter(writtenOps([addOf('now', 'alpha')]));
            await engine.refresh(TAB);
            const cursorsBefore = cursorsOf(world, TAB);
            const languageBefore = recapOf(world, TAB)?.language;
            const keysBefore = keysOfTab(world);
            world.store.failReads('readRecap', SCRIPT_FAILED);
            world.setRead(chunkAt(9));
            world.setWriter(writtenOps([addOf('now', 'beta')]));
            await engine.refresh(TAB);
            world.store.failReads('readRecap', 0);
            world.setRead(quietAt(9));
            world.setWriter(NO_OPS);
            const readsBefore = world.positions().length;
            await engine.refresh(TAB);
            assert.deepEqual(world.positions().slice(readsBefore).map((position) => position.cursor), cursorsBefore.map((cursor) => cursor.cursor));
            assert.equal(recapOf(world, TAB)?.language, languageBefore);
            assert.deepEqual(keysOfTab(world), keysBefore);
        },
    },
    {
        id: 'RDF-3',
        group: 'RDF',
        title: 'keysOf returns Unknown: the run is skipped as in RDF-1',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            world.store.failReads('keysOf', SCRIPT_FAILED);
            await engine.refresh(TAB);
            assertSkipped(world);
        },
    },
    {
        id: 'RDF-4',
        group: 'RDF',
        title: 'openOf or recentlyClosed returns Unknown: if beginRun was called, failRun follows, and cursors do not advance',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(chunkAt(3));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            const cursorsBefore = cursorsOf(world, TAB);
            const beginsBefore = countOf(world, 'beginRun');
            const failsBefore = countOf(world, 'failRun');
            world.store.failReads('openOf', SCRIPT_FAILED);
            world.store.failReads('recentlyClosed', SCRIPT_FAILED);
            world.setRead(chunkAt(9));
            await engine.refresh(TAB);
            const begins = countOf(world, 'beginRun') - beginsBefore;
            const fails = countOf(world, 'failRun') - failsBefore;
            assert.equal(fails, begins);
            assert.deepEqual(cursorsOf(world, TAB), cursorsBefore);
        },
    },
    {
        id: 'RDF-5',
        group: 'RDF',
        title: 'readRecap returns null for a new scope: the run proceeds from UNREAD',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.deepEqual(world.positions()[0], UNREAD);
            assert.equal(runCount(world), 1);
        },
    },
    {
        id: 'RDF-6',
        group: 'RDF',
        title: 'a refresh that hits the readRecap failure of RDF-1 resolves',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            world.store.failReads('readRecap', SCRIPT_FAILED);
            await engine.refresh(TAB);
            assert.equal(world.requests().length, 0);
        },
    },
];
