import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStoreAt } from '#src/adapters/db/database.ts';
import { factsOfTabAt } from '#src/adapters/db/imported.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { usdOf } from '#src/recap/domain/usd.ts';
import { paneIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';
import { hiddenStateOf } from '#test/support/seen.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import { cursor, filterOf, memoryStore, recordOps, storeRead, type RunInput } from './support.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { Store } from '#src/adapters/db/database.ts';

const TAB = tabId('w1:t1');
const PANE = paneId('w1:p1');
const add = (section: 'done' | 'goal', text: string, why: string | null = null): Operation => ({ op: 'add', section, text: textOf(text), why: why === null ? null : textOf(why), ref: null, at: null, agent: null });
const run = (at: number): RunInput => ({
    tab: TAB, at: instant(at), cause: 'requested', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: null, lanes: [cursor('w1:p1')],
    tasks: [{ id: textOf('t1'), name: textOf(''), lanes: [paneIdOf('w1:p1')] }], ops: [{ task: textOf('t1'), ops: [add('goal', 'ship'), add('done', 'first', 'because')] }],
});
const odd = (store: Store, ...statements: readonly string[]): void => {
    store.db.exec('PRAGMA ignore_check_constraints = ON');
    store.db.exec('PRAGMA foreign_keys = OFF');
    statements.forEach((statement) => { store.db.exec(statement); });
};
const lanesOf = (store: Store): readonly LaneCursor[] => storeRead(store.records.readRecap(TAB))?.lanes ?? [];
const byText = (left: readonly unknown[], right: readonly unknown[]): number => JSON.stringify(left).localeCompare(JSON.stringify(right));
const MODE = 'added';
const BIG = 9223372036854775807n;

test('readRecap: empty, null, zero, negative and past-2^53 lane columns read the way main reads them; an unknown tab reads as none', () => {
    const store = memoryStore();
    recordOps(store, run(100));
    odd(store, "UPDATE transcript SET cursor = 0, tail = '', title = NULL, last_prompt = '', claude_note = ''");
    assert.deepEqual(lanesOf(store).map((lane) => [lane.cursor, lane.tail, lane.title, lane.lastPrompt, lane.claudeRecap]), [[0, '', null, '', '']]);
    odd(store, `UPDATE transcript SET cursor = ${BIG}`);
    assert.equal(lanesOf(store)[0]?.cursor, Number(BIG));
    odd(store, 'UPDATE transcript SET cursor = -4');
    assert.equal(lanesOf(store)[0]?.cursor, -4);
    assert.equal(store.records.readRecap(tabId('w9:t9')), null);
});

test('runs and entries: a flag stored as 0, 1, 2 or -1 and a missing backend read as main reads them; a non-16-byte id drops the read to nothing', () => {
    const store = memoryStore();
    recordOps(store, run(100));
    const query = filterOf({ tab: 'w1:t1', since: null, limit: 10, withInput: false });
    const first = store.inputs.runs(query);
    assert.equal(first.length, 1);
    assert.deepEqual(first.map((entry) => [entry.at, entry.language, entry.backend, entry.input]), [[100, 'en', 'claude', 'absent']]);
    odd(store, "UPDATE run SET backend = NULL, at = 0");
    assert.deepEqual(store.inputs.runs(query).map((entry) => [entry.at, entry.backend]), [[0, null]]);
    odd(store, `UPDATE run SET at = ${BIG}`);
    assert.deepEqual(store.inputs.runs(query).map((entry) => entry.at), [Number(BIG)]);
    const id = first[0]?.id;
    assert.ok(id !== undefined);
    assert.deepEqual(store.inputs.itemsOf(id, MODE).map((entry) => [entry.section, entry.text, entry.birth, entry.anchor]), [['goal', 'ship', 'born', null], ['done', 'first', 'born', null]]);
    odd(store, "UPDATE fact SET anchor = ''");
    assert.deepEqual(store.inputs.itemsOf(id, MODE).map((entry) => entry.anchor), ['', '']);
    odd(store, "UPDATE run SET id = x'0102'");
    assert.deepEqual(store.inputs.runs(query), []);
});

test('readHidden: a blanket stored as 0, 1, 2 or -1 is hidden only for 1; an unknown state is neither hidden nor shown', () => {
    const store = memoryStore();
    store.visibility.writeHidden(hiddenStateOf({ all: true, hidden: ['w1:t3'], shown: ['w1:t2'] }));
    assert.deepEqual(store.visibility.readHidden(), hiddenStateOf({ all: true, hidden: ['w1:t3'], shown: ['w1:t2'] }));
    const seen: boolean[] = [];
    [0, 2, -1, 1].forEach((stored) => {
        odd(store, `UPDATE column_state SET all_hidden = ${stored}`);
        seen.push(store.visibility.readHidden().all);
    });
    assert.deepEqual(seen, [false, false, false, true]);
    odd(store, "UPDATE tab_visibility SET state = 'other'");
    assert.deepEqual(store.visibility.readHidden(), hiddenStateOf({ all: true, hidden: [], shown: [] }));
});

test('historyOf: empty why, zero times and a null closed reason read as main reads them', () => {
    const store = memoryStore();
    recordOps(store, run(100));
    odd(store, "UPDATE fact SET why = '', first_at = 0, last_at = 0");
    const facts = store.ledger.historyOf(TAB, PANE);
    assert.deepEqual(facts.map((fact) => [fact.section, fact.text, fact.why, fact.state, fact.closedWhy, fact.firstAt, fact.lastAt]).toSorted(byText), [['done', 'first', '', 'open', null, 0, 0], ['goal', 'ship', '', 'open', null, 0, 0]].toSorted(byText));
});

test('factsOfTabAt: reads a store file by path through the path-based reader, odd text included, and nothing for a tab it does not hold', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-rows-'));
    try {
        const path = fsPathOf(join(dir, 'store.db'));
        const opened = openStoreAt(path);
        assert.ok(opened.kind === 'ready');
        recordOps(opened, run(100));
        odd(opened, "UPDATE fact SET why = ''");
        opened.db.close();
        const facts = factsOfTabAt(path, TAB) ?? [];
        assert.deepEqual(facts.map((fact) => [fact.section, fact.text, fact.why]).toSorted(byText), [['done', 'first', ''], ['goal', 'ship', '']].toSorted(byText));
        assert.deepEqual(factsOfTabAt(path, tabId('w9:t9')), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

