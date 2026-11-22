import assert from 'node:assert/strict';
import { instant, type AccomplishmentEstablished, type Engine, type Entry, type LedgerEvent, type RecapWritten, type TurnRecorded } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { followed, key, scope, session } from '../ids.ts';
import type { EngineWorld } from '../world.ts';
import { text } from '../values.ts';
import { addOf, causeOf, chunkOf, countOf, NO_OPS, spoken, writtenOps } from './support.ts';

const TAB = scope('one');

const isKind = <K extends LedgerEvent['kind']>(kind: K) => (item: LedgerEvent): item is Extract<LedgerEvent, { kind: K }> => item.kind === kind;

const firstOf = <T>(items: readonly T[]): T => {
    const [first] = items;
    if (first === undefined) {
        throw new Error('the list is empty');
    }
    return first;
};

const writtenOf = (world: EngineWorld): readonly RecapWritten[] => world.events().filter(isKind('recap-written'));
const turnsOf = (world: EngineWorld): readonly TurnRecorded[] => world.events().filter(isKind('turn-recorded'));
const accomplishmentsOf = (world: EngineWorld): readonly AccomplishmentEstablished[] => world.events().filter(isKind('accomplishment-established'));

const TWO_USER: readonly Entry[] = [
    { role: 'user', text: text('one'), at: instant(10) },
    { role: 'user', text: text('two'), at: instant(20) },
    { role: 'user', text: text('queued'), at: instant(30), queued: true },
];

export const EVT_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'EVT-1',
        group: 'EVT',
        title: 'a written run emits one recap-written with its scope, turns, boundary and cause',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            const written = writtenOf(world);
            assert.equal(written.length, 1);
            assert.equal(firstOf(written).scope, TAB);
            assert.equal(firstOf(written).turns, 1);
            assert.equal(typeof firstOf(written).boundary, 'boolean');
            assert.equal(firstOf(written).cause, 'requested');
        },
    },
    {
        id: 'EVT-2',
        group: 'EVT',
        title: 'a failed run and an empty run emit no recap-written',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setWriter(NO_OPS);
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            world.setRead(spoken('hello'));
            world.setWriter({ kind: 'throw', message: 'boom' });
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            assert.equal(writtenOf(world).length, 0);
        },
    },
    {
        id: 'EVT-3',
        group: 'EVT',
        title: 'a written run with two user entries and one queued entry emits two turn-recorded for the key',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(chunkOf(TWO_USER));
            world.setWriter(NO_OPS);
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            const turns = turnsOf(world).filter((item) => item.key === key('a'));
            assert.equal(turns.length, 2);
            assert.deepEqual(
                turns.map((item) => item.at),
                [instant(10), instant(20)],
            );
        },
    },
    {
        id: 'EVT-4',
        group: 'EVT',
        title: 'the count of turn-recorded in a run equals the turns of its recap-written',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(chunkOf(TWO_USER));
            world.setWriter(NO_OPS);
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            const written = writtenOf(world);
            assert.equal(written.length, 1);
            assert.equal(turnsOf(world).length, firstOf(written).turns);
        },
    },
    {
        id: 'EVT-5',
        group: 'EVT',
        title: 'a written run that adds a fact in section done emits one accomplishment-established',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(writtenOps([addOf('done', 'shipped the thing')]));
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            const established = accomplishmentsOf(world);
            assert.equal(established.length, 1);
            assert.equal(firstOf(established).fact.text, 'shipped the thing');
            assert.equal(firstOf(established).task, firstOf(established).fact.task);
            assert.deepEqual(firstOf(established).sessions, [key('a')]);
        },
    },
    {
        id: 'EVT-6',
        group: 'EVT',
        title: 'ops that update a done fact or add a fact in another section emit no accomplishment-established',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(writtenOps([addOf('done', 'shipped the thing'), addOf('now', 'working on it')]));
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            const established = accomplishmentsOf(world);
            assert.equal(established.length, 1);
            assert.equal(firstOf(established).fact.text, 'shipped the thing');
            world.setRead(spoken('again'));
            world.setWriter(writtenOps([{ op: 'update', id: firstOf(established).fact.id, text: 'shipped the thing twice', why: null }, addOf('next', 'later work')]));
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            assert.equal(writtenOf(world).length, 2);
            assert.equal(accomplishmentsOf(world).length, 1);
        },
    },
    {
        id: 'EVT-7',
        group: 'EVT',
        title: 'a refused op emits no event, the accepted op still does',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(writtenOps([addOf('done', 'real'), { op: 'close', id: 'missing', why: 'done' }]));
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            const established = accomplishmentsOf(world);
            assert.equal(established.length, 1);
            assert.equal(firstOf(established).fact.text, 'real');
        },
    },
    {
        id: 'EVT-8',
        group: 'EVT',
        title: 'the events of one run come in order: turn-recorded, accomplishment-established, recap-written',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(writtenOps([addOf('done', 'shipped')]));
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            assert.deepEqual(
                world.events().map((item) => item.kind),
                ['turn-recorded', 'accomplishment-established', 'recap-written'],
            );
            assert.ok(world.store.calls().includes('recordRun'));
        },
    },
    {
        id: 'EVT-9',
        group: 'EVT',
        title: 'an on handler that throws does not stop the run or the later events',
        level: 'full',
        async run(world, engine) {
            let delivered = 0;
            world.setOn(() => {
                delivered += 1;
                if (delivered === 1) {
                    throw new Error('listener boom');
                }
            });
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(chunkOf(TWO_USER));
            world.setWriter(NO_OPS);
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            assert.ok(world.lines().some((line) => line.includes('listener boom')));
            assert.equal(turnsOf(world).length, 2);
            assert.equal(writtenOf(world).length, 1);
            assert.equal(delivered, world.events().length);
        },
    },
    {
        id: 'EVT-10',
        group: 'EVT',
        title: 'without an on handler a written run behaves the same',
        level: 'full',
        async run(world, engine) {
            engine.follow(TAB, followed(key('a'), { session: session('s1') }));
            world.setRead(spoken('hello'));
            world.setWriter(NO_OPS);
            engine.turnEnded(TAB, key('a'), 'requested');
            await world.settle();
            assert.equal(countOf(world, 'beginRun'), 1);
            assert.equal(causeOf(world, TAB), 'requested');
            assert.notEqual(world.store.records.readRecap(TAB), null);
        },
    },
];
