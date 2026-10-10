import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lane } from '#test/autocompact-world.ts';
import { world, rows } from '#test/autocompact-world.ts';

test('a shadow kind records the full decision with shadow mode and sends no compact request', async () => {
    const w = world({ mode: 'on', shadowKinds: ['codex'] });
    await w.service.consider(lane('codex', 'idle'));
    assert.equal(rows(w).length, 1);
    assert.equal(rows(w)[0]?.mode, 'shadow');
    assert.equal(rows(w)[0]?.gate, 'ask');
    assert.deepEqual(w.requests, []);
});

test('idle and done Claude lanes with open transcript work are held by the in-flight gate', async () => {
    const w = world({ mode: 'on' });
    w.inFlight = 2;
    for (const status of ['idle', 'done']) {
        await w.service.consider(lane('claude', status));
        const skip = w.store.autocompact.skips().find((each) => each.agent === 'claude');
        assert.deepEqual([skip?.gate, skip?.detail], ['in-flight', '2 running']);
        assert.deepEqual(w.requests, []);
        w.store.autocompact.pruneSkips([]);
    }
    assert.deepEqual(rows(w), []);
});

test('a shadow kind with open transcript work remains held by the in-flight gate and queues nothing', async () => {
    const w = world({ mode: 'on', shadowKinds: ['codex'] });
    w.inFlight = 1;
    await w.service.consider(lane('codex', 'idle'));
    const skip = w.store.autocompact.skips().find((each) => each.agent === 'codex');
    assert.deepEqual([skip?.gate, skip?.detail], ['in-flight', '1 running']);
    assert.deepEqual(rows(w), []);
    assert.deepEqual(w.requests, []);
});
