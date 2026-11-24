import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DecisionLedgerRepository } from '#src/adapters/db/autocompact-records.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { lane, SAFE, world } from './autocompact-world.ts';

test('a sweep records a draft through the decision ledger and the same ledger reads back an equal stored row', async () => {
    const w = world();
    await w.service.consider(lane());
    const ledger = new DecisionLedgerRepository(w.store.db);
    const [stored] = ledger.newest(must(parseCount(5)));
    assert.ok(stored !== undefined);
    assert.deepEqual(
        [stored.scope, stored.key, stored.agent, stored.mode, stored.gate, stored.verdict, stored.askedVerdict, stored.share, stored.tokens, stored.window, stored.decider, stored.tookMs, stored.costUsd, stored.laneStatus],
        ['w1:t1', 'w1:p1', 'claude', 'on', 'ask', 'compact', 'compact', 62, 620_000, 1_000_000, 'fake · m', 550, 0.00003, 'idle'],
    );
    assert.deepEqual(Object.fromEntries(stored.answers), SAFE);
    assert.deepEqual(ledger.lastDecision(stored.scope, stored.key), { at: stored.at, tokens: stored.tokens, mode: 'on', verdict: 'compact', gate: 'ask' });
});
