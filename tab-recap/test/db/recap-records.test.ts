import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Fact } from '@stateforge-labs/session-ledger';
import { instant, textOf, usdOf } from '@stateforge-labs/session-ledger';
import { tabId } from '#test/support/ids.ts';
import { paneIdOf } from '#src/recap/domain/ids.ts';
import type { TaskShape } from '@stateforge-labs/session-ledger';
import { cursor, memoryStore } from './support.ts';

const shape = (id: string, lanes: readonly string[]): TaskShape => ({ id: textOf(id), name: textOf(''), sessions: lanes.map((lane) => paneIdOf(lane)) });

test('a fact the run carries with an id that is not a fact typeid throws, and the run leaves no trace', () => {
    const store = memoryStore(); const { records, db } = store;
    const carried: Fact = JSON.parse('{"id":"run_00000000000000000000000001","task":{"scope":"w1:t1","key":"t1"},"section":"done","text":"x","why":null,"ref":null,"agent":null,"anchor":null,"firstAt":100,"lastAt":100,"state":"open","closedWhy":null,"closedAt":null,"language":"en"}');
    assert.throws(() => { records.recordRun({ scope: tabId('w1:t1'), at: instant(100), cause: 'requested', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0.25), error: null, sessions: [cursor('w1:p1')], tasks: [shape('t1', ['w1:p1'])], changed: [carried], refused: [] }); }, /is not a fact id/);
    for (const table of ['run', 'task', 'fact']) {
        assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0, table);
    }
    assert.equal(db.inTransaction, false);
});
