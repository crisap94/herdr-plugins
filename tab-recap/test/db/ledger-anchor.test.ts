import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeIdOf } from '#src/adapters/db/typeid.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import type { RecordedRun } from '#src/ports/recap-records.ts';
import type { FactId, RunId } from '#src/recap/domain/fact.ts';
import type { Operation, RunRef } from '#src/recap/domain/ops.ts';
import { cursor, memoryStore } from './support.ts';

const TASK = { tab: 'w1:t1', key: 't1' };
const add = (text: string): Operation => ({ op: 'add', section: 'done', text, why: null, ref: null, at: null, agent: null });
const run = (at: number, ops: readonly Operation[]): RecordedRun => ({
    tab: 'w1:t1', at, cause: 'requested', backend: 'claude', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }], ops: [{ task: 't1', ops }],
});
const ref = (db: ReturnType<typeof memoryStore>['db'], at: number): RunRef => {
    const row = db.prepare('SELECT id FROM run ORDER BY id DESC LIMIT 1').get() as { id: Uint8Array };
    return { id: typeIdOf('run', row.id) as RunId, task: TASK, at, language: 'en', mint: () => typeIdOf('fact', ids.next()) as FactId };
};

test('the anchor an add carries is stored and read back; an update may replace it, one without keeps it; a fact added without one has none', () => {
    const { records, ledger, db } = memoryStore();
    records.recordRun(run(100, [{ op: 'add', section: 'done', text: 'Merged !256', why: null, ref: null, at: null, agent: null, anchor: 'merge !256 after green' }, add('Tagged 1.9.0')]));
    const [merged, tagged] = ['Merged !256', 'Tagged 1.9.0'].map((text) => ledger.openOf(TASK).find((fact) => fact.text === text));
    assert.ok(merged !== undefined && tagged !== undefined);
    assert.deepEqual([merged.anchor, tagged.anchor], ['merge !256 after green', null]);
    ledger.apply(ref(db, 200), [{ op: 'update', id: merged.id, text: 'Merged !256 today', why: null }, { op: 'update', id: tagged.id, text: 'Tagged 1.9.0 today', why: null, anchor: 'the tag is v1.9.0' }]);
    assert.deepEqual(ledger.openOf(TASK).map((fact) => [fact.text, fact.anchor]).toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))), [['Merged !256 today', 'merge !256 after green'], ['Tagged 1.9.0 today', 'the tag is v1.9.0']]);
    assert.deepEqual(db.prepare('SELECT anchor FROM fact_readable ORDER BY anchor').all().map((row) => row['anchor']), ['merge !256 after green', 'the tag is v1.9.0']);
});
