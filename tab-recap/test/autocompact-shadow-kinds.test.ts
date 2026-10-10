import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { lane, world, rows } from '#test/autocompact-world.ts';

test('shadow Codex records with shadow mode while enabled Claude compacts normally', async () => {
    const w = world({ mode: 'on', kinds: ['claude', 'codex'], shadowKinds: ['codex'] });
    await w.service.consider(lane('codex', 'idle'));
    await w.service.consider(laneFrom({ paneId: 'w1:p2', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' }));
    const decisions = rows(w);
    assert.equal(decisions.length, 2);
    assert.deepEqual(decisions.map(({ agent, mode }) => [agent, mode]), [['claude', 'on'], ['codex', 'shadow']]);
    assert.equal(decisions.find(({ agent }) => agent === 'codex')?.gate, 'ask');
    assert.deepEqual(w.requests.map(({ pane }) => pane), ['w1:p2']);
});

test('a Claude lane omitted from KINDS keeps mode on while record-only', async () => {
    const w = world({ mode: 'on', kinds: ['codex'] });
    await w.service.consider(lane('claude', 'idle'));
    assert.equal(rows(w)[0]?.mode, 'on');
    assert.ok(w.logs.some((line) => line.includes('→ compact (on, record-only)')));
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
