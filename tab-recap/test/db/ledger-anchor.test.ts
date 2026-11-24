import { storeRead } from '#test/db/support.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeIdOf } from '#src/adapters/db/typeid.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { LedgerRepository } from '#src/adapters/db/ledger.ts';
import type { FactId, RunId } from '@stateforge-labs/session-ledger';
import type { Operation, RunRef } from '@stateforge-labs/session-ledger';
import { cursor, memoryStore, recordOps, type RunInput } from './support.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { tabId } from '#test/support/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { usdOf } from '@stateforge-labs/session-ledger';
import { paneIdOf, tabIdOf } from '@stateforge-labs/session-ledger';

const TASK = { scope: tabIdOf('w1:t1'), key: textOf('t1') };
const add = (text: string): Operation => ({ op: 'add', section: 'done', text: textOf(text), why: null, ref: null, at: null, agent: null });
const run = (at: number, ops: readonly Operation[]): RunInput => ({
    scope: tabId('w1:t1'), at: instant(at), cause: 'requested', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor('w1:p1')], tasks: [{ id: textOf('t1'), name: textOf(''), sessions: [paneIdOf('w1:p1')] }], ops: [{ task: textOf('t1'), ops }],
});
const ref = (db: ReturnType<typeof memoryStore>['db'], at: number): RunRef => {
    const row = db.prepare('SELECT id FROM run ORDER BY id DESC LIMIT 1').get() as { id: Uint8Array };
    return { id: typeIdOf('run', row.id) as string as RunId, task: TASK, at: instant(at), language: textOf('en'), mint: () => typeIdOf('fact', ids.next()) as string as FactId };
};

test('the anchor an add carries is stored and read back; an update may replace it, one without keeps it; a fact added without one has none', () => {
    const store = memoryStore(); const { ledger, db } = store;
    const repo = new LedgerRepository(db);
    recordOps(store, run(100, [{ op: 'add', section: 'done', text: textOf('Merged !256'), why: null, ref: null, at: null, agent: null, anchor: textOf('merge !256 after green') }, add('Tagged 1.9.0')]));
    const [merged, tagged] = ['Merged !256', 'Tagged 1.9.0'].map((text) => storeRead(ledger.openOf(TASK)).find((fact) => fact.text === text));
    assert.ok(merged !== undefined && tagged !== undefined);
    assert.deepEqual([merged.anchor, tagged.anchor], ['merge !256 after green', null]);
    repo.apply(ref(db, 200), [{ op: 'update', id: merged.id, text: textOf('Merged !256 today'), why: null }, { op: 'update', id: tagged.id, text: textOf('Tagged 1.9.0 today'), why: null, anchor: textOf('the tag is v1.9.0') }]);
    assert.deepEqual(storeRead(ledger.openOf(TASK)).map((fact) => [fact.text, fact.anchor]).toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))), [['Merged !256 today', 'merge !256 after green'], ['Tagged 1.9.0 today', 'the tag is v1.9.0']]);
    assert.deepEqual(db.prepare('SELECT anchor FROM fact_readable ORDER BY anchor').all().map((row) => row['anchor']), ['merge !256 after green', 'the tag is v1.9.0']);
});
