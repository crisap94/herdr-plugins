import assert from 'node:assert/strict';
import { UNREAD, type Engine, type Position, type Recap } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { followed, harness, key, scope, session } from '../ids.ts';
import type { Behaviour, EngineWorld, LocatedAnswer, WrittenAnswer } from '../world.ts';
import { chunkAt, countOf, cursorsOf, NO_OPS, quietAt, recapOf } from './support.ts';

const TAB = scope('one');
const FAILED = { why: 'failed' as const, code: 1, detail: 'scripted writer failure' };
const READ_FAILED = { why: 'failed' as const, code: 1, detail: 'scripted read failure' };

const failWriter: Behaviour<WrittenAnswer> = { kind: 'fail', why: FAILED };

const cursorOf = (world: EngineWorld, pane: string): number | undefined => cursorsOf(world, TAB).find((lane) => lane.pane === pane)?.cursor;

const laneOf = (world: EngineWorld, pane: string): Recap['lanes'][number] | undefined => recapOf(world, TAB)?.lanes.find((lane) => lane.pane === pane);

export const CSR_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'CSR-1',
        group: 'CSR',
        title: 'a written run stores the cursor of the chunk position',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(chunkAt(7));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.deepEqual(cursorsOf(world, TAB), [{ pane: 'a', transcript: 'a', cursor: 7 }]);
        },
    },
    {
        id: 'CSR-2',
        group: 'CSR',
        title: 'a quiet run stores the positions and starts no run',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(quietAt(4));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.equal(cursorOf(world, 'a'), 4);
            assert.equal(countOf(world, 'beginRun'), 0);
        },
    },
    {
        id: 'CSR-3',
        group: 'CSR',
        title: 'a failed run keeps the cursor of the last written run',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(chunkAt(5));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            world.setRead(chunkAt(9));
            world.setWriter(failWriter);
            await engine.refresh(TAB);
            assert.equal(cursorOf(world, 'a'), 5);
        },
    },
    {
        id: 'CSR-4',
        group: 'CSR',
        title: 'after a failed run the next run reads from the kept cursor and the writer sees the new entries',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(chunkAt(5));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            world.setRead(chunkAt(9));
            world.setWriter(failWriter);
            await engine.refresh(TAB);
            world.setRead(chunkAt(9));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.deepEqual(world.positions().at(-1), { cursor: 5, tail: null });
            assert.ok(JSON.stringify(world.requests().at(-1)).includes('hello'));
        },
    },
    {
        id: 'CSR-5',
        group: 'CSR',
        title: 'one source fails to read: its cursor stays, the other source advances, and the error names the failed pane',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.follow(TAB, followed(key('b'), { session: session('s2') }));
            world.setReadBySource((source) => (source === 'b' ? { kind: 'fail', why: READ_FAILED } : chunkAt(3)));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.equal(cursorOf(world, 'a'), 3);
            assert.equal(cursorOf(world, 'b') ?? 0, 0);
            assert.equal(recapOf(world, TAB)?.error, 'b: exited 1: scripted read failure');
        },
    },
    {
        id: 'CSR-6',
        group: 'CSR',
        title: 'a source that cannot be located and a harness with no reader each name their pane in the error',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            engine.follow(TAB, followed(key('b'), { session: session('s2') }));
            engine.follow(TAB, followed(key('c'), { session: session('s3'), harness: harness('codex') }));
            world.setLocate((target) => {
                const answer: Behaviour<LocatedAnswer> =
                    target.key === key('b')
                        ? { kind: 'fail', why: { why: 'not-found', what: 'transcript' } }
                        : { kind: 'answer', value: { kind: 'located', source: target.key } };
                return answer;
            });
            world.setRead(chunkAt(2));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            assert.equal(recapOf(world, TAB)?.error, 'b: transcript not found');
            world.setNoReader(harness('codex'));
            await engine.refresh(TAB);
            assert.ok(recapOf(world, TAB)?.error?.includes('c: no scripted reader for codex'));
        },
    },
    {
        id: 'CSR-7',
        group: 'CSR',
        title: 'a new source for the same key continues the old cursor only when the reader confirms it holds exactly the bytes already read from the old source; otherwise, or when the old source can no longer be read, it starts at UNREAD and the old cursor is kept',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('moved'), { session: session('s1') }));
            engine.follow(TAB, followed(key('other'), { session: session('s2') }));
            engine.follow(TAB, followed(key('agent'), { session: session('s3') }));
            engine.follow(TAB, followed(key('nosession')));
            const sources = new Map([['moved', 'm1'], ['other', 'o1'], ['agent', 'a1'], ['nosession', 'n1']]);
            const carried: string[] = [];
            world.setLocate((target) => ({ kind: 'answer', value: { kind: 'located', source: sources.get(target.key) ?? target.key } }));
            world.setReadBySource((next) => chunkAt(next.endsWith('1') ? 5 : 9));
            world.setCarry((from, to, at) => {
                carried.push(`${from}>${to}`);
                return from === 'm1' && to === 'm2' ? at : UNREAD;
            });
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            engine.follow(TAB, followed(key('agent'), { session: session('s3'), harness: harness('codex') }));
            for (const [name, next] of [['moved', 'm2'], ['other', 'o2'], ['agent', 'a2'], ['nosession', 'n2']] as const) sources.set(name, next);
            await engine.refresh(TAB);
            const readFrom = (): Map<string, Position | undefined> => new Map(world.reads().map((source, at) => [source, world.positions()[at]]));
            assert.deepEqual(['m2', 'o2', 'a2', 'n2'].map((source) => readFrom().get(source)), [{ cursor: 5, tail: null }, UNREAD, UNREAD, UNREAD]);
            assert.deepEqual(carried.toSorted(), ['m1>m2', 'o1>o2']);
            sources.set('other', 'o1');
            await engine.refresh(TAB);
            assert.deepEqual(readFrom().get('o1'), { cursor: 5, tail: null });
            assert.ok(cursorsOf(world, TAB).some((cursor) => cursor.pane === 'other' && cursor.transcript === 'o2' && cursor.cursor === 9));
        },
    },
    {
        id: 'CSR-8',
        group: 'CSR',
        title: 'title, last prompt and claude recap are stored, and a null in a later read keeps the stored value',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(chunkAt(1, { title: 'T1', lastPrompt: 'P1', claudeRecap: 'R1' }));
            world.setWriter(NO_OPS);
            await engine.refresh(TAB);
            const first = laneOf(world, 'a');
            assert.ok(first);
            assert.equal(first.title, 'T1');
            assert.equal(first.lastPrompt, 'P1');
            assert.equal(first.claudeRecap, 'R1');
            world.setRead(chunkAt(2, { title: null, lastPrompt: null, claudeRecap: null }));
            await engine.refresh(TAB);
            const second = laneOf(world, 'a');
            assert.ok(second);
            assert.equal(second.title, 'T1');
            assert.equal(second.lastPrompt, 'P1');
            assert.equal(second.claudeRecap, 'R1');
        },
    },
];
