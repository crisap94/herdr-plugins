import { instant } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AskBookRepository } from '#src/adapters/db/ask-ledger.ts';
import { HandoffQueueRepository } from '#src/adapters/db/handoff-queue.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { AskDraft } from '#src/ports/ask-ledger.ts';
import type { HandoffAsk } from '#src/ports/requests.ts';
import { parseToolName } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import { memoryStore } from './db/support.ts';
import { rid } from './fakes/ask-ledger.ts';

const ask: AskDraft = { exchange: HANDOFF_EXCHANGE, requester: must(parseToolName('coordinator')), id: rid('h1'), pane: paneId('w1:p1'), at: instant(1), ref: null };

const request: HandoffAsk = { tab: tabId('w1:t1'), pane: paneId('w1:p1'), toPane: paneId('w1:p2'), note: null, refresh: 'as-is', source: { kind: 'live' }, answer: must(parseText('h1')) };

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
    assert.deepEqual([store.asks.unfinished(), store.requests.takeHandoffs(), new AskBookRepository(store.db).unfinished()], [[], [], []]);
});
