import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AskLedgerRepository } from '#src/adapters/db/ask-ledger.ts';
import { HandoffQueueRepository } from '#src/adapters/db/handoff-queue.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { NewAsk } from '#src/ports/ask-ledger.ts';
import type { NewHandoffRequest } from '#src/ports/requests.ts';
import { toolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { memoryStore } from './db/support.ts';
import { rid } from './fakes/ask-ledger.ts';

const ask: NewAsk = { exchange: HANDOFF_EXCHANGE, requester: must(toolName('coordinator')), id: rid('h1'), pane: paneId('w1:p1'), at: 1, ref: null };

const request: NewHandoffRequest = { tab: tabId('w1:t1'), pane: paneId('w1:p1'), toPane: paneId('w1:p2'), note: null, refreshFirst: false, source: { kind: 'live' }, answer: must(parseText('h1')) };

const queueOf = (store: Store): HandoffQueueRepository => new HandoffQueueRepository(store.db, store.asks, store.requests);

test('a queued handoff records its ask, inserts its request row and attaches the row id to the ask', () => {
    const store = memoryStore();
    queueOf(store).queueHandoff(ask, request);
    const [row] = store.requests.takeHandoffs();
    assert.equal(row?.answer, 'h1');
    assert.deepEqual(store.asks.unfinished().map((each) => each.ref), [String(row.id)]);
});

test('a failing request insert leaves no ask and no row', () => {
    const store = memoryStore();
    store.db.exec("CREATE TRIGGER refuse_handoff BEFORE INSERT ON request WHEN NEW.kind = 'handoff' BEGIN SELECT RAISE(ABORT, 'insert refused'); END");
    assert.throws(() => { queueOf(store).queueHandoff(ask, request); }, /insert refused/);
    assert.deepEqual([store.asks.unfinished(), store.requests.takeHandoffs()], [[], []]);
});

test('a failing attach leaves neither the ask nor the row, and a restart finds no half state', () => {
    const store = memoryStore();
    store.db.exec("CREATE TRIGGER refuse_attach BEFORE UPDATE OF ref ON ask BEGIN SELECT RAISE(ABORT, 'attach refused'); END");
    assert.throws(() => { queueOf(store).queueHandoff(ask, request); }, /attach refused/);
    assert.deepEqual([store.asks.unfinished(), store.requests.takeHandoffs(), new AskLedgerRepository(store.db).unfinished()], [[], [], []]);
});
