import assert from 'node:assert/strict';
import { TextDecoder, TextEncoder } from 'node:util';
import type { Engine } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { followed, key, restore, scope, session } from '../ids.ts';
import type { EngineWorld } from '../world.ts';
import { addOf, blockedOps, causeOf, countOf, NO_OPS, spoken, writtenOps } from './support.ts';

const TAB = scope('one');
const OTHER = scope('two');
const LIMIT = 200;

const bytesOf = (text: string): number => new TextEncoder().encode(text).length;

const isValidUtf8 = (text: string): boolean => new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(text)) === text;

const LONG_A = `fact one ${'x'.repeat(80)}`;
const LONG_B = `fact two ${'é'.repeat(80)}`;

export const CMP_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'CMP-1',
        group: 'CMP',
        title: 'compacted while a run of the scope is in flight returns at once, without waiting for the writer',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(blockedOps([]));
            engine.turnEnded(TAB, key('a'), 'requested');
            const text: string = engine.compacted(TAB, key('a'));
            assert.equal(typeof text, 'string');
            world.release();
            await world.settle();
        },
    },
    {
        id: 'CMP-2',
        group: 'CMP',
        title: 'compacted on a scope with no written recap returns the empty Restore text',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            assert.equal(engine.compacted(TAB, key('a')), restore(''));
            await world.settle();
        },
    },
    {
        id: 'CMP-3',
        group: 'CMP',
        title: 'compacted after a written recap returns text with every open fact of the task of the key',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(writtenOps([addOf('now', 'first open fact'), addOf('now', 'second open fact')]));
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            const text: string = engine.compacted(TAB, key('a'));
            assert.ok(text.includes('first open fact'));
            assert.ok(text.includes('second open fact'));
            await world.settle();
        },
    },
    {
        id: 'CMP-4',
        group: 'CMP',
        title: 'restoreBytes of 200 bounds the result to 200 UTF-8 bytes, valid UTF-8, and the result is not empty',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(writtenOps([addOf('now', LONG_A), addOf('now', LONG_B)]));
            world.setRestoreBytes(LIMIT);
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            assert.ok(bytesOf(world.store.markdown()) > LIMIT);
            const text: string = engine.compacted(TAB, key('a'));
            assert.ok(text.length > 0);
            assert.ok(bytesOf(text) <= LIMIT);
            assert.ok(isValidUtf8(text));
            await world.settle();
        },
    },
    {
        id: 'CMP-5',
        group: 'CMP',
        title: 'compacted schedules a refresh of the scope: one run with cause requested follows',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            engine.compacted(TAB, key('a'));
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 1);
            assert.equal(causeOf(world, TAB), 'requested');
        },
    },
    {
        id: 'CMP-6',
        group: 'CMP',
        title: 'compacted while a run is in flight returns the last written recap, not the run in flight',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(writtenOps([addOf('now', 'written before')]));
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            world.setWriter(blockedOps([addOf('now', 'in flight only')]));
            engine.turnEnded(TAB, key('a'), 'requested');
            const text: string = engine.compacted(TAB, key('a'));
            assert.ok(text.includes('written before'));
            assert.ok(!text.includes('in flight only'));
            world.release();
            await world.settle();
        },
    },
    {
        id: 'CMP-7',
        group: 'CMP',
        title: 'compacted for a key that is not followed returns the empty Restore text, without a throw or a run',
        level: 'full',
        async run(world, engine) {
            assert.equal(engine.compacted(TAB, key('ghost')), restore(''));
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 0);
            assert.deepEqual(world.requests(), []);
        },
    },
    {
        id: 'CMP-8',
        group: 'CMP',
        title: 'a failed readRecap during compacted returns the empty Restore text and logs one line',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(writtenOps([addOf('now', 'kept open fact')]));
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            const before = world.lines().length;
            world.store.failReads('readRecap', 1);
            assert.equal(engine.compacted(TAB, key('a')), restore(''));
            assert.equal(world.lines().length, before + 1);
            await world.settle();
            assert.ok(engine.compacted(TAB, key('a')).includes('kept open fact'));
            await world.settle();
        },
    },
    {
        id: 'CMP-9',
        group: 'CMP',
        title: 'compacted on one scope never returns the text of a key followed in another scope',
        level: 'surface',
        async run(_world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            assert.equal(engine.compacted(OTHER, key('a')), restore(''));
        },
    },
    {
        id: 'CMP-10',
        group: 'CMP',
        title: 'follow a key, then compacted for it with no turnEnded or refresh before: the key counts as followed',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            engine.compacted(TAB, key('a'));
            await world.settle();
            assert.deepEqual(
                world.located().map((item) => item.key),
                [key('a')],
            );
            assert.equal(countOf(world, 'beginRun'), 1);
            assert.equal(causeOf(world, TAB), 'requested');
        },
    },
];
