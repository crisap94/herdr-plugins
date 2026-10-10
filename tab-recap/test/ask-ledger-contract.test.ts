import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AskLedgerRepository } from '#src/adapters/db/ask-ledger.ts';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import type { AskLedger } from '#src/ports/ask-ledger.ts';
import { exchangeName, toolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { MemoryAskLedger } from './fakes/ask-ledger.ts';

const sqlite = (): AskLedger => {
    const opened = openDatabase(MEMORY);
    assert.equal(opened.kind, 'ready');
    return new AskLedgerRepository(opened.db);
};

const implementations: readonly (readonly [string, () => AskLedger])[] = [['SQLite', sqlite], ['in-memory double', (): AskLedger => new MemoryAskLedger()]];

const coordinator = must(toolName('coordinator'));
const reviewer = must(toolName('reviewer'));
const handoff = must(exchangeName('handoff'));

for (const [name, make] of implementations) {
    test(`${name}: an ask is seen by its exchange, requester and id; the local 'cli' requester and another tool are other asks`, () => {
        const ledger = make();
        assert.equal(ledger.seen(COMPACT_EXCHANGE, coordinator, 'r7'), false);
        ledger.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: 'r7', pane: 'w1:p1', at: 1, ref: null });
        ledger.record({ exchange: COMPACT_EXCHANGE, requester: 'cli', id: 'r7', pane: 'w1:p1', at: 2, ref: null });
        assert.deepEqual(
            [ledger.seen(COMPACT_EXCHANGE, coordinator, 'r7'), ledger.seen(COMPACT_EXCHANGE, reviewer, 'r7'), ledger.seen(COMPACT_EXCHANGE, 'cli', 'r7'), ledger.seen(handoff, coordinator, 'r7')],
            [true, false, true, false],
        );
    });

    test(`${name}: a duplicate record is ignored and keeps the first ask`, () => {
        const ledger = make();
        ledger.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: 'r7', pane: 'w1:p1', at: 1, ref: null });
        ledger.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: 'r7', pane: 'w1:p2', at: 2, ref: null });
        assert.deepEqual(ledger.unfinished().map((ask) => [ask.pane, ask.at]), [['w1:p1', 1]]);
    });

    test(`${name}: an exchange with no descriptor is recorded, settled and seen like any other`, () => {
        const ledger = make();
        ledger.record({ exchange: handoff, requester: coordinator, id: 'h1', pane: 'w1:p1', at: 1, ref: 'handoff-1' });
        assert.equal(ledger.seen(handoff, coordinator, 'h1'), true);
        ledger.settle({ exchange: handoff, id: 'h1', pane: 'w1:p1' }, 'done');
        assert.deepEqual(ledger.unfinished(), []);
    });

    test(`${name}: settle matches the exchange, the id and the pane, and only an unsettled ask`, () => {
        const ledger = make();
        ledger.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: 'r7', pane: 'w1:p1', at: 1, ref: null });
        ledger.settle({ exchange: COMPACT_EXCHANGE, id: 'r7', pane: 'w1:p2' }, 'done');
        ledger.settle({ exchange: handoff, id: 'r7', pane: 'w1:p1' }, 'done');
        assert.equal(ledger.unfinished().length, 1, 'another pane or another exchange settles nothing');
        ledger.settle({ exchange: COMPACT_EXCHANGE, id: 'r7', pane: 'w1:p1' }, 'done');
        assert.deepEqual(ledger.unfinished(), []);
    });

    test(`${name}: unfinished lists the asks with no outcome, oldest first, including a local requester's`, () => {
        const ledger = make();
        ledger.record({ exchange: COMPACT_EXCHANGE, requester: 'cli', id: 'l1', pane: 'w1:p1', at: 2, ref: null });
        ledger.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: 'r7', pane: 'w1:p2', at: 1, ref: null });
        ledger.record({ exchange: COMPACT_EXCHANGE, requester: reviewer, id: 'r8', pane: 'w1:p3', at: 3, ref: null });
        ledger.settle({ exchange: COMPACT_EXCHANGE, id: 'r8', pane: 'w1:p3' }, 'done');
        assert.deepEqual(ledger.unfinished().map((ask) => [ask.requester, ask.id, ask.exchange]), [['coordinator', 'r7', 'compact'], ['cli', 'l1', 'compact']]);
    });

    test(`${name}: prune deletes only settled asks older than the cut; an old unsettled ask stays`, () => {
        const ledger = make();
        ledger.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: 'old-open', pane: 'w1:p1', at: 100, ref: null });
        ledger.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: 'old-done', pane: 'w1:p2', at: 100, ref: null });
        ledger.settle({ exchange: COMPACT_EXCHANGE, id: 'old-done', pane: 'w1:p2' }, 'done');
        ledger.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: 'new-done', pane: 'w1:p3', at: 900, ref: null });
        ledger.settle({ exchange: COMPACT_EXCHANGE, id: 'new-done', pane: 'w1:p3' }, 'done');
        ledger.prune(500);
        assert.deepEqual(
            [ledger.seen(COMPACT_EXCHANGE, coordinator, 'old-open'), ledger.seen(COMPACT_EXCHANGE, coordinator, 'old-done'), ledger.seen(COMPACT_EXCHANGE, coordinator, 'new-done')],
            [true, false, true],
        );
        assert.deepEqual(ledger.unfinished().map((ask) => ask.id), ['old-open']);
    });
}

test('SQLite: a read that fails answers seen, so nothing is acted on that cannot be recorded, and lists no unfinished ask', () => {
    const opened = openDatabase(MEMORY);
    assert.equal(opened.kind, 'ready');
    const ledger = new AskLedgerRepository(opened.db);
    opened.db.close();
    assert.equal(ledger.seen(COMPACT_EXCHANGE, coordinator, 'r7'), true);
    assert.deepEqual(ledger.unfinished(), []);
});
