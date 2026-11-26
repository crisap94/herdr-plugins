import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { choice, fakeOutput, fakeRuntime, libraryHarness } from '#test/fakes/harness-runtime.ts';
import { RecapWriter } from '#src/adapters/job/writer.ts';
import { jobTagFor } from '#src/daemon/harness-makers.ts';
import { add, engineWorld, ops, type EngineWorld } from '../support/engine-world.ts';

const GOAL = add('goal', 'Add a cart to the shop', 'Add a cart to the shop');
const DONE = add('done', 'Added totals in src/totals.ts', 'Added totals in src/totals.ts');

describe('the model fails, answers nonsense, then hangs', () => {
    let world: EngineWorld;

    before(async () => {
        world = engineWorld();
        world.script(ops(GOAL));
        world.grow(1);
        await world.engine.refresh(world.scope, [world.lane]);
    });

    after(() => {
        world.close();
    });

    test('an answer that is not operations is retried once with what was wrong', { timeout: 30_000 }, async () => {
        world.script({ kind: 'text', text: 'sorry, I cannot do that' }, { kind: 'text', text: '{"foo": 1}' });
        world.grow(1);
        const prior = world.asked.length;
        await world.engine.refresh(world.scope, [world.lane]);
        assert.equal(world.asked.length - prior, 2, 'one call and one retry');
        assert.match(world.asked.at(-1)?.correction ?? '', /no JSON object/);
    });

    test('the previous recap stays, with the error line and the cost of both calls', { timeout: 30_000 }, () => {
        assert.deepEqual(world.facts().map((fact) => [fact.section, fact.text, fact.state]), [['goal', 'Add a cart to the shop', 'open']]);
        const failed = world.runs().at(-1);
        assert.match(failed?.error ?? '', /not usable/);
        assert.equal(failed?.cost, 0.2);
    });

    test('a model that fails outright is called once and not retried', { timeout: 30_000 }, async () => {
        world.script({ kind: 'failed' });
        const prior = world.asked.length;
        await world.engine.refresh(world.scope, [world.lane]);
        assert.equal(world.asked.length - prior, 1);
        assert.notEqual(world.runs().at(-1)?.error, null);
        assert.equal(world.runs().at(-1)?.cost, 0);
    });

    test('a model that hangs ends the run as a timeout, once, and the recap stays', { timeout: 30_000 }, async () => {
        world.script({ kind: 'timeout' });
        const prior = world.asked.length;
        await world.engine.refresh(world.scope, [world.lane]);
        assert.equal(world.asked.length - prior, 1);
        assert.match(world.runs().at(-1)?.error ?? '', /timeout|timed out/);
        assert.deepEqual(world.facts().map((fact) => fact.text), ['Add a cart to the shop']);
    });

    test('the next turn is written: the engine moved on and read everything the failed runs left unread', { timeout: 30_000 }, async () => {
        world.script(ops(DONE));
        world.grow(1);
        const prior = world.asked.length;
        await world.engine.refresh(world.scope, [world.lane]);
        assert.equal(world.asked.length - prior, 1);
        const document = world.documents().at(-1) ?? '';
        assert.ok(document.includes('Use SQLite for it, no server'), 'the turn of the first failure');
        assert.ok(document.includes('also add totals'), 'the turn after the failures');
        assert.equal(world.runs().at(-1)?.error, null);
        assert.deepEqual(world.facts().map((fact) => fact.text), ['Add a cart to the shop', 'Added totals in src/totals.ts']);
    });
});

describe('an opencode run', () => {
    test('that times out makes one headless call and no cleanup plan, and the run fails as a timeout', { timeout: 30_000 }, async () => {
        const runtime = fakeRuntime({ scripts: { opencode: [{ kind: 'timeout', message: 'slow', timeoutMs: 100 }] } });
        const world = engineWorld({ writer: new RecapWriter(libraryHarness(runtime, 'opencode', 100), choice('', 'default')) });
        try {
            world.grow(1);
            await world.engine.refresh(world.scope, [world.lane]);
            assert.equal(runtime.calls.length, 1);
            assert.equal(runtime.calls[0]?.id, 'opencode');
            assert.equal(runtime.plans.length, 0);
            assert.match(world.runs().at(-1)?.error ?? '', /timeout|timed out/);
            assert.deepEqual(world.facts(), []);
        } finally {
            world.close();
        }
    });

    test('that answers is never asked to persist and is given no title, variant or flag', { timeout: 30_000 }, async () => {
        const runtime = fakeRuntime({ scripts: { opencode: [fakeOutput({ text: JSON.stringify({ ops: [GOAL] }) })] } });
        const world = engineWorld({ writer: new RecapWriter(libraryHarness(runtime, 'opencode', 1000), choice('', 'default')) });
        try {
            world.grow(1);
            await world.engine.refresh(world.scope, [world.lane]);
            assert.deepEqual(runtime.calls.map((each) => each.options.persist), [false]);
            assert.deepEqual(Object.keys(runtime.calls[0]?.request ?? {}).toSorted(), ['effort', 'input', 'instructions']);
            assert.equal(runtime.calls[0]?.request.effort, 'harness-default');
            assert.deepEqual(world.facts().map((fact) => fact.text), ['Add a cart to the shop']);
        } finally {
            world.close();
        }
    });

    for (const tags of ['on', 'off'] as const) {
        test(`its run is tagged recap-writer only when the telemetry tags are ${tags}`, { timeout: 30_000 }, async () => {
            const runtime = fakeRuntime({ scripts: { opencode: [fakeOutput({ text: JSON.stringify({ ops: [GOAL] }) })] } });
            const world = engineWorld({ writer: new RecapWriter(libraryHarness(runtime, 'opencode', 1000, jobTagFor({ telemetryTags: tags }, 'recapWriter')), choice('', 'default')) });
            try {
                world.grow(1);
                await world.engine.refresh(world.scope, [world.lane]);
                const env = runtime.calls[0]?.options.env;
                const given = env?.kind === 'inherit' && env.transform !== undefined ? env.transform({}) : {};
                assert.deepEqual(given, tags === 'on' ? { OTEL_RESOURCE_ATTRIBUTES: 'harness.job=recap-writer' } : {});
            } finally {
                world.close();
            }
        });
    }
});
