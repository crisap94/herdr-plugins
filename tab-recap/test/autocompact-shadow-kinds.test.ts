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

test('an idle lane with open transcript work records a stale reason and does not block the decision', async () => {
    const w = world({ mode: 'on' });
    w.inFlight = 2;
    await w.service.consider(lane('claude', 'idle'));
    assert.equal(rows(w).length, 1);
    assert.deepEqual(w.store.autocompact.skips(), []);
    assert.ok(w.logs.some((line) => line.includes('stale: idle pane with 2 open work items')));
});
