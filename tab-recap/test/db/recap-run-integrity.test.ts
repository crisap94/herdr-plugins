import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opsOfSections } from '#src/adapters/db/import/sections-to-ops.ts';
import type { TaskShape } from '@stateforge-labs/session-ledger';
import type { RecapSections } from '@stateforge-labs/session-ledger';
import { cursor, memoryStore, recordOps, type RunInput } from './support.ts';
import type { TaskOps } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { tabId } from '#test/support/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { usdOf } from '@stateforge-labs/session-ledger';
import { paneIdOf } from '#src/recap/domain/ids.ts';

const sections = { goal: textOf('ship'), now: [textOf('a')], needs: [], done: [textOf('b'), textOf('c')], decisions: [], next: [], links: [textOf('x.ts')], rules: [] };
const shape = (id: string, lanes: readonly string[], name = ''): TaskShape => ({ id: textOf(id), name: textOf(name), sessions: lanes.map((lane) => paneIdOf(lane)) });
const adds = (task: string, of: RecapSections = sections): readonly TaskOps[] => [{ task: textOf(task), ops: opsOfSections(of) }];
const run = (over: Partial<RunInput> = {}): RunInput => ({
    scope: tabId('w1:t1'), at: instant(100), cause: 'requested', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0.25), error: null, sessions: [cursor('w1:p1')], tasks: [shape('t1', ['w1:p1'])], ops: adds('t1'), ...over,
});

test('a run is all or nothing: a run whose fact the schema refuses (an empty text) leaves no trace', () => {
    const store = memoryStore(); const { db } = store;
    const refused = [{ task: textOf('t1'), ops: [{ op: 'add' as const, section: 'done' as const, text: textOf('fine'), why: null, ref: null, at: null, agent: null }, { op: 'add' as const, section: 'done' as const, text: textOf(''), why: null, ref: null, at: null, agent: null }] }];
    assert.throws(() => { recordOps(store, run({ ops: refused })); }, /CHECK constraint failed/);
    for (const table of ['run', 'task', 'transcript', 'fact', 'run_task']) {
        assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0, table);
    }
    assert.equal(db.inTransaction, false);
});

test('a connection that cannot answer (a damaged schema) reads as unreadable, never as no recap and never a throw into the render loop', () => {
    const store = memoryStore(); const { records, db } = store;
    recordOps(store, run());
    db.exec('DROP VIEW last_good_run');
    const read = records.readRecap(tabId('w1:t1'));
    assert.equal(read !== null && 'kind' in read ? read.why.why : 'read', 'unreadable');
});
