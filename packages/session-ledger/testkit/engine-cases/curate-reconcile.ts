import assert from 'node:assert/strict';
import { instant, UNREAD, type Chunk, type Engine, type Fact, type StoryChange, type TaskId } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { factOf } from '../facts.ts';
import { key } from '../ids.ts';
import { grew, text as textOf } from '../values.ts';
import type { Behaviour, CuratedAnswer, CuratorCall, EngineWorld } from '../world.ts';
import { NO_OPS, recapOf, spoken } from './support.ts';
import { TAB, seedOpen } from './curate.ts';
import { scopeIdOf } from '../../src/recap/domain/followed-session-shape.ts';

const MINUTES = 60_000;

const answered = (text: string): Behaviour<CuratedAnswer> => ({ kind: 'answer', value: { kind: 'curated', text } });

const RECONCILE_DONE = JSON.stringify({ ops: [{ op: 'close', id: 'f1', why: 'done', evidence: 'the open work is finished' }] });

const taskOf = (world: EngineWorld): TaskId => {
    const [only] = recapOf(world, TAB)?.tasks ?? [];
    assert.ok(only);
    return { scope: scopeIdOf(TAB), key: textOf(key(only.id)) };
};

const openOf = (world: EngineWorld, id: string, firstAt: number, lastAt: number): Fact => factOf(id, { task: taskOf(world), text: textOf(`open work ${id}`), firstAt: instant(firstAt), lastAt: instant(lastAt) });

const changeAt = (world: EngineWorld, index: number): StoryChange => {
    const found = world.changes()[index];
    assert.ok(found);
    return found;
};

const seedTwoOpen = async (world: EngineWorld, engine: Engine): Promise<void> => {
    await seedOpen(world, engine);
    world.store.seed(null, [openOf(world, 'fct_1', 1, 1), openOf(world, 'fct_2', 2, 2)]);
};

const modesOf = (world: EngineWorld): readonly CuratorCall['mode'][] => world.curatorCalls().map((call) => call.mode);

const writtenCount = (world: EngineWorld): number => world.events().filter((event) => event.kind === 'recap-written').length;

const scriptReconcile = (world: EngineWorld): void => {
    world.setRead(spoken('the open work is finished'));
    world.setWriter(NO_OPS);
    world.setCuratorBy((call) => (call.mode === 'reconcile' ? answered(RECONCILE_DONE) : answered('{"story":"the work is finished"}')));
};

const runOnce = async (world: EngineWorld, engine: Engine): Promise<void> => {
    engine.turnEnded(TAB, key('a'), 'requested');
    await world.settle();
};

const boundaryChunk = (): Behaviour<Chunk> => ({
    kind: 'answer',
    value: { kind: 'chunk', entries: [{ role: 'user', text: textOf('the open work is finished') }], title: null, lastPrompt: null, harnessRecap: null, notes: [], marks: [{ kind: 'compacted', at: instant(5) }], position: UNREAD, grew: grew(true) },
});

export const CUR_RECONCILE_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'CUR-8',
        group: 'CUR',
        title: 'a task with an open fact and a tail is reconciled before its story is written',
        level: 'full',
        async run(world, engine) {
            await seedTwoOpen(world, engine);
            world.setRead(spoken('the open work is finished'));
            world.setCuratorBy((call) => (call.mode === 'reconcile' ? answered(RECONCILE_DONE) : answered('{"story":"the work is finished"}')));
            await engine.curate(TAB);
            await world.settle();
            assert.deepEqual(world.curatorCalls().map((call) => call.mode), ['reconcile', 'story']);
            const [reconciled, told] = [changeAt(world, 0), changeAt(world, 1)];
            assert.deepEqual(reconciled.reconciled?.map((op) => [op.op, op.id]), [['close', 'fct_1']]);
            assert.equal(reconciled.story, null);
            assert.equal(told.story, 'the work is finished');
            assert.ok(world.lines().includes(`curator one ${taskOf(world).key}: reconciled 0 facts`));
        },
    },
    {
        id: 'CUR-9',
        group: 'CUR',
        title: 'a merge in the answer closes the fact as merged and keeps the story; a merge of an unknown id is refused and logged',
        level: 'full',
        async run(world, engine) {
            await seedTwoOpen(world, engine);
            world.setCurator(answered('{"story":"two facts became one","ops":[{"op":"close","id":"f1","why":"merged","into":"f2"}]}'));
            await engine.curate(TAB);
            await world.settle();
            const merged = changeAt(world, 0);
            assert.equal(merged.story, 'two facts became one');
            assert.deepEqual(merged.merges, [{ op: 'close', id: 'fct_1', why: 'merged' }]);
            world.clock.set(10 * MINUTES);
            world.store.seed(null, [openOf(world, 'fct_1', 1, 1), openOf(world, 'fct_2', 2, 20 * MINUTES)]);
            world.setCurator(answered('{"story":"still one story","ops":[{"op":"close","id":"f9","why":"merged","into":"f2"}]}'));
            const lines = world.lines().length;
            await engine.curate(TAB);
            await world.settle();
            const refused = changeAt(world, 1);
            assert.deepEqual(refused.merges, []);
            assert.equal(refused.story, 'still one story');
            assert.deepEqual(world.lines().slice(lines), [`curator one ${taskOf(world).key}: refused — f9 is not an open fact (or is already merged)`]);
        },
    },
    {
        id: 'CUR-10',
        group: 'CUR',
        title: 'with story repair once a refused first answer is asked again and the second story is kept; with the setting absent the curator is asked once',
        level: 'full',
        async run(world, engine) {
            await seedTwoOpen(world, engine);
            world.setStoryRepair('once');
            world.setCuratorBy((call) => answered(call.document.includes('<previous-answer>') ? '{"story":"the second story"}' : '{"ops":[]}'));
            await engine.curate(TAB);
            await world.settle();
            const calls = world.curatorCalls();
            assert.equal(calls.length, 2);
            assert.ok(calls[1]?.document.includes('<previous-answer>\n{"ops":[]}\n</previous-answer>'));
            assert.ok(calls[1]?.document.includes('<refused>\n- no paragraph\n</refused>'));
            assert.deepEqual(world.changes().map((change) => change.story), ['the second story']);
            assert.ok(world.lines().includes(`curator one ${taskOf(world).key}: story repair — 0 refused`));
            world.setStoryRepair('off');
            world.clock.set(10 * MINUTES);
            world.store.seed(null, [openOf(world, 'fct_1', 1, 20 * MINUTES)]);
            await engine.curate(TAB);
            await world.settle();
            assert.equal(world.curatorCalls().length, 3);
            assert.deepEqual(world.changes().map((change) => change.story), ['the second story', null]);
        },
    },
    {
        id: 'CUR-11',
        group: 'CUR',
        title: 'a repaired answer that is not JSON falls back to the first answer',
        level: 'full',
        async run(world, engine) {
            await seedTwoOpen(world, engine);
            world.setStoryRepair('once');
            world.setCuratorBy((call) => answered(call.document.includes('<previous-answer>') ? 'sorry, no JSON here' : '{"story":"first story is kept","ops":[{"op":"close","id":"f9","why":"merged","into":"f2"}]}'));
            await engine.curate(TAB);
            await world.settle();
            assert.equal(world.curatorCalls().length, 2);
            assert.deepEqual(world.changes().map((change) => change.story), ['first story is kept']);
            assert.deepEqual(world.changes().map((change) => change.merges), [[]]);
        },
    },
    {
        id: 'CUR-12',
        group: 'CUR',
        title: 'two curate calls within five minutes reconcile and curate once; later the story is written again and the reconcile waits for new turns',
        level: 'full',
        async run(world, engine) {
            await seedTwoOpen(world, engine);
            world.setRead(spoken('the open work is finished'));
            world.setCuratorBy((call) => (call.mode === 'reconcile' ? answered(RECONCILE_DONE) : answered('{"story":"the work is finished"}')));
            await engine.curate(TAB);
            await world.settle();
            assert.equal(world.curatorCalls().length, 2);
            world.clock.set(4 * MINUTES);
            world.store.seed(null, [openOf(world, 'fct_1', 1, 1), openOf(world, 'fct_2', 2, 3 * MINUTES)]);
            await engine.curate(TAB);
            await world.settle();
            assert.equal(world.curatorCalls().length, 2);
            world.clock.set(6 * MINUTES);
            await engine.curate(TAB);
            await world.settle();
            assert.deepEqual(world.curatorCalls().map((call) => call.mode), ['reconcile', 'story', 'story']);
        },
    },
    {
        id: 'CUR-13',
        group: 'CUR',
        title: 'with reconcileEvery 3 the third written run of one turn reconciles once and writes no story, then the count starts again',
        level: 'full',
        async run(world, engine) {
            await seedTwoOpen(world, engine);
            world.setReconcileEvery(3);
            scriptReconcile(world);
            await runOnce(world, engine);
            await runOnce(world, engine);
            assert.deepEqual(modesOf(world), []);
            await runOnce(world, engine);
            assert.deepEqual(modesOf(world), ['reconcile']);
            assert.equal(world.changes().length, 1);
            assert.equal(changeAt(world, 0).story, null);
            world.clock.set(10 * MINUTES);
            await runOnce(world, engine);
            await runOnce(world, engine);
            assert.deepEqual(modesOf(world), ['reconcile']);
            await runOnce(world, engine);
            assert.deepEqual(modesOf(world), ['reconcile', 'reconcile']);
            assert.ok(world.changes().every((change) => change.story === null));
        },
    },
    {
        id: 'CUR-14',
        group: 'CUR',
        title: 'a written run with a boundary reconciles at once',
        level: 'full',
        async run(world, engine) {
            await seedTwoOpen(world, engine);
            world.setReconcileEvery(100);
            scriptReconcile(world);
            await runOnce(world, engine);
            assert.deepEqual(modesOf(world), []);
            world.setRead(boundaryChunk());
            await runOnce(world, engine);
            assert.deepEqual(modesOf(world), ['reconcile']);
            assert.equal(changeAt(world, 0).story, null);
        },
    },
    {
        id: 'CUR-15',
        group: 'CUR',
        title: 'without reconcileEvery no number of runs reconciles and the host still gets every recap-written event',
        level: 'full',
        async run(world, engine) {
            await seedTwoOpen(world, engine);
            scriptReconcile(world);
            const before = writtenCount(world);
            for (let run = 0; run < 10; run += 1) {
                await runOnce(world, engine);
            }
            world.setRead(boundaryChunk());
            await runOnce(world, engine);
            assert.deepEqual(modesOf(world), []);
            assert.equal(world.changes().length, 0);
            assert.equal(writtenCount(world) - before, 11);
        },
    },
    {
        id: 'CUR-16',
        group: 'CUR',
        title: 'a curate request right after an after-run reconcile does not reconcile the same task again within five minutes',
        level: 'full',
        async run(world, engine) {
            await seedTwoOpen(world, engine);
            world.setReconcileEvery(1);
            scriptReconcile(world);
            await runOnce(world, engine);
            assert.deepEqual(modesOf(world), ['reconcile']);
            world.clock.set(MINUTES);
            await engine.curate(TAB);
            await world.settle();
            assert.deepEqual(modesOf(world), ['reconcile', 'story']);
        },
    },
];
