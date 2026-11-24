import assert from 'node:assert/strict';
import type { Engine, Fact, Operation } from '@stateforge-labs/session-ledger';
import type { Case } from '../run.ts';
import { followed, key, scope, session } from '../ids.ts';
import type { EngineWorld } from '../world.ts';
import { addOf, recapOf, spoken, writtenOps } from './support.ts';
import { textOf } from '../../src/recap/domain/text.ts';
import { tabIdOf } from '../../src/recap/domain/lane-shape.ts';

const TAB = scope('one');
const TASK = { scope: tabIdOf(TAB), key: textOf('t1') };

const factsOf = (world: EngineWorld): readonly Fact[] => {
    const found = world.store.facts.allOf(TASK);
    if ('kind' in found) {
        throw new Error('allOf is unknown');
    }
    return found;
};

const openOf = (world: EngineWorld): readonly Fact[] => factsOf(world).filter((fact) => fact.state === 'open');

const shapeOf = (fact: Fact): object => ({ id: fact.id, text: fact.text, state: fact.state, closedWhy: fact.closedWhy, closedAt: fact.closedAt });

const targetOf = (op: Operation): string => (op.op === 'add' ? op.text : op.id);

const reasonsFor = (world: EngineWorld, kind: Operation['op'], target: string): readonly string[] => [
    ...world.store.refusals().filter((refusal) => refusal.op.op === kind && targetOf(refusal.op) === target).map((refusal) => refusal.reason),
    ...world
        .requests()
        .flatMap((request) => request.retry?.refused ?? [])
        .filter((entry) => entry.operation.op === kind && targetOf(entry.operation) === target)
        .flatMap((entry) => entry.reasons.map((reason) => reason.reason)),
];

const refused = (world: EngineWorld, kind: Operation['op'], target: string): boolean => reasonsFor(world, kind, target).length > 0;

const refusedAs = (world: EngineWorld, kind: Operation['op'], target: string, reason: string): boolean => reasonsFor(world, kind, target).some((each) => each.includes(reason));

const closeOp = (id: string, why: string | null): object => ({ op: 'close', id, why, anchor: null });

const updateOp = (id: string, text: string): object => ({ op: 'update', id, text, why: null, anchor: null });

const runWith = async (world: EngineWorld, engine: Engine, ops: readonly object[], text: string): Promise<void> => {
    const asked = world.requests().length;
    world.setRead(spoken(text));
    world.setWriter(writtenOps(ops));
    engine.turnEnded(TAB, key('a'), 'requested');
    await world.settle();
    assert.ok(world.requests().length > asked);
};

const shownId = async (world: EngineWorld, engine: Engine, text: string): Promise<string> => {
    await runWith(world, engine, [], 'look');
    const shown = world.requests().at(-1)?.input.ledgers.flatMap((ledger) => ledger.facts).find((fact) => fact.text === text);
    assert.ok(shown !== undefined);
    return shown.id;
};

const followA = (engine: Engine): void => {
    engine.follow(TAB, followed(key('a'), { session: session('s1') }));
};

export const LED_CASES: readonly Case<EngineWorld, Engine>[] = [
    {
        id: 'LED-1',
        group: 'LED',
        title: 'an op that closes or updates an id not in the task is refused as unknown-id, and no fact changes',
        level: 'full',
        async run(world, engine) {
            followA(engine);
            await runWith(world, engine, [addOf('now', 'alpha')], 'one');
            assert.ok(!refused(world, 'add', 'alpha'));
            const before = factsOf(world).map(shapeOf);
            await runWith(world, engine, [closeOp('fct_missing', 'done'), updateOp('fct_missing', 'changed')], 'two');
            assert.ok(refused(world, 'close', 'fct_missing'));
            assert.ok(refused(world, 'update', 'fct_missing'));
            assert.deepEqual(factsOf(world).map(shapeOf), before);
        },
    },
    {
        id: 'LED-2',
        group: 'LED',
        title: 'an op on a fact that is already closed is refused as closed',
        level: 'full',
        async run(world, engine) {
            followA(engine);
            await runWith(world, engine, [addOf('now', 'alpha')], 'one');
            const id = await shownId(world, engine, 'alpha');
            await runWith(world, engine, [closeOp(id, 'done')], 'two');
            assert.equal(factsOf(world)[0]?.closedWhy, 'done');
            const before = factsOf(world).map(shapeOf);
            await runWith(world, engine, [closeOp(id, 'wrong')], 'three');
            assert.ok(refusedAs(world, 'close', id, 'closed'));
            assert.deepEqual(factsOf(world).map(shapeOf), before);
        },
    },
    {
        id: 'LED-3',
        group: 'LED',
        title: 'a close with no why is refused as no-why',
        level: 'full',
        async run(world, engine) {
            followA(engine);
            await runWith(world, engine, [addOf('now', 'alpha')], 'one');
            const id = await shownId(world, engine, 'alpha');
            await runWith(world, engine, [closeOp(id, null)], 'two');
            assert.ok(refused(world, 'close', id));
            assert.deepEqual(openOf(world).map((fact) => fact.text), ['alpha']);
        },
    },
    {
        id: 'LED-4',
        group: 'LED',
        title: 'an add in section goal while a goal is open: the old goal is closed as superseded, and one goal is open',
        level: 'full',
        async run(world, engine) {
            followA(engine);
            await runWith(world, engine, [addOf('goal', 'ship it')], 'one');
            await runWith(world, engine, [addOf('goal', 'pivot')], 'two');
            const goals = factsOf(world).filter((fact) => fact.section === 'goal');
            const old = goals.find((fact) => fact.text === 'ship it');
            assert.ok(old !== undefined);
            assert.equal(old.state, 'closed');
            assert.equal(old.closedWhy, 'superseded');
            assert.deepEqual(goals.filter((fact) => fact.state === 'open').map((fact) => fact.text), ['pivot']);
        },
    },
    {
        id: 'LED-5',
        group: 'LED',
        title: 'two goal adds in one run: the second is refused as second-goal',
        level: 'full',
        async run(world, engine) {
            followA(engine);
            await runWith(world, engine, [addOf('goal', 'first'), addOf('goal', 'second')], 'one');
            assert.ok(refusedAs(world, 'add', 'second', 'second-goal'));
            const goals = factsOf(world).filter((fact) => fact.section === 'goal');
            assert.deepEqual(goals.map((fact) => ({ text: fact.text, state: fact.state })), [{ text: 'first', state: 'open' }]);
        },
    },
    {
        id: 'LED-6',
        group: 'LED',
        title: 'a new fact language equals the run language',
        level: 'full',
        async run(world, engine) {
            world.setLanguage('pt');
            followA(engine);
            await runWith(world, engine, [addOf('now', 'alpha')], 'one');
            assert.equal(openOf(world)[0]?.language, 'pt');
            assert.equal(recapOf(world, TAB)?.language, 'pt');
        },
    },
    {
        id: 'LED-7',
        group: 'LED',
        title: 'new fact ids come from environment.ids.next(): the store mints nothing',
        level: 'full',
        async run(world, engine) {
            followA(engine);
            await runWith(world, engine, [addOf('now', 'alpha')], 'one');
            const fact = openOf(world)[0];
            assert.ok(fact !== undefined);
            assert.match(fact.id, /^id-\d+$/);
        },
    },
    {
        id: 'LED-8',
        group: 'LED',
        title: 'recordRun after the fold moved carries the changed facts, and FactStore.apply is never called',
        level: 'full',
        async run(world, engine) {
            followA(engine);
            await runWith(world, engine, [addOf('now', 'alpha')], 'one');
            const id = await shownId(world, engine, 'alpha');
            await runWith(world, engine, [closeOp(id, 'done'), addOf('now', 'beta')], 'two');
            assert.ok(!('apply' in world.store.facts));
            const markdown = recapOf(world, TAB)?.tasks[0]?.markdown ?? '';
            assert.ok(markdown.includes('beta'));
            assert.ok(!markdown.includes('alpha'));
            const alpha = factsOf(world).find((fact) => fact.text === 'alpha');
            const beta = factsOf(world).find((fact) => fact.text === 'beta');
            assert.ok(alpha !== undefined && beta !== undefined);
            assert.equal(alpha.state, 'closed');
            assert.equal(beta.state, 'open');
            const carried = JSON.stringify(world.store.recorded().at(-1) ?? null);
            assert.ok(carried.includes(alpha.id));
            assert.ok(carried.includes(beta.id));
        },
    },
];
