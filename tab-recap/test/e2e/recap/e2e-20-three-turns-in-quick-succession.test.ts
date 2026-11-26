import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { debounceOf } from '@stateforge-labs/session-ledger';
import { add, engineWorld, ops, type EngineWorld } from '../support/engine-world.ts';

const SETTLE_AT_MOST = 20_000;

describe('with the default settle delay', () => {
    let world: EngineWorld;

    before(() => {
        world = engineWorld();
        world.script(ops(add('goal', 'Add a cart to the shop', 'Add a cart to the shop')));
    });

    after(() => {
        world.close();
    });

    test('three turn ends in a row make no run at once', { timeout: 30_000 }, () => {
        for (const turn of [1, 2, 3]) {
            world.grow(1);
            world.engine.turnEnded(world.scope, [world.lane], 'turn-ended');
            assert.equal(world.asked.length, 0, `turn ${turn} did not call the model`);
        }
        assert.deepEqual(world.runs(), []);
    });

    test('one run follows the quiet moment, and it covers all three turns', { timeout: 30_000 }, async () => {
        await world.until(() => world.runs().length > 0, 'the run after the settle delay');
        await world.engine.idle(world.scope);
        assert.equal(world.asked.length, 1);
        assert.deepEqual(world.runs().map((run) => [run.cause, run.error]), [['turn-ended', null]]);
        const document = world.documents()[0] ?? '';
        for (const said of ['Add a cart to the shop', 'Use SQLite for it, no server', 'also add totals']) {
            assert.ok(document.includes(said), `the run read: ${said}`);
        }
    });
});

describe('with a debounce window', () => {
    let world: EngineWorld;

    before(() => {
        world = engineWorld({ debounce: debounceOf('5000') });
        world.script(ops(add('goal', 'Add a cart to the shop', 'Add a cart to the shop')), ops(add('done', 'Added totals in src/totals.ts', 'Added totals in src/totals.ts')));
    });

    after(() => {
        world.close();
    });

    test('the first turn end of the process runs at once', { timeout: 30_000 }, async () => {
        world.grow(1);
        world.engine.turnEnded(world.scope, [world.lane], 'turn-ended');
        await world.until(() => world.runs().length === 1, 'the first run');
        assert.equal(world.asked.length, 1);
    });

    test('three turn ends inside the window join one run at its end, and it covers all three', { timeout: SETTLE_AT_MOST + 10_000 }, async () => {
        const began = Date.now();
        for (const turn of [1, 2, 3]) {
            world.grow(1);
            world.engine.turnEnded(world.scope, [world.lane], 'turn-ended');
            assert.equal(world.runs().length, 1, `turn ${turn} started no run`);
        }
        await world.until(() => world.runs().length === 2, 'the run at the end of the window');
        await world.engine.idle(world.scope);
        assert.equal(world.runs().length, 2, 'nothing more ran for the three turns');
        assert.ok(Date.now() - began >= 4_000, 'the run waited for the window');
        const document = world.documents()[1] ?? '';
        for (const said of ['Use SQLite for it, no server', 'also add totals', 'open a merge request']) {
            assert.ok(document.includes(said), `the run read: ${said}`);
        }
    });
});
