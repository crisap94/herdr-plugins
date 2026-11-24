import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshStatusOf } from '#src/recap/domain/freshness.ts';
import { refreshWithin } from '#src/daemon/refresh-status.ts';
import { memoryStore, recordOps } from './db/support.ts';
import { duration, instant } from '@stateforge-labs/session-ledger';
import { tabId } from '#test/support/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { usdOf } from '@stateforge-labs/session-ledger';

const never = (): Promise<void> => new Promise<void>(() => undefined);

test('a waited refresh is timed out whatever the tab says, and otherwise refreshed or failed by the stored error', () => {
    assert.deepEqual([
        refreshStatusOf('done', null),
        refreshStatusOf('done', textOf('the summarizer failed')),
        refreshStatusOf('timeout', null),
        refreshStatusOf('timeout', textOf('the summarizer failed')),
    ], ['refreshed', 'failed', 'timed-out', 'timed-out']);
});

test('a refresh that finishes with no stored error is refreshed', async () => {
    assert.equal(await refreshWithin(Promise.resolve(), memoryStore().records, tabId('w1:t1'), duration(1_000)), 'refreshed');
});

test('a refresh that finishes with a stored error is failed', async () => {
    const store = memoryStore();
    store.records.failRun({ scope: tabId('w1:t1'), at: instant(100), cause: 'requested', backend: null, language: textOf('en'), costUsd: usdOf(0), error: textOf(textOf('the summarizer failed')), sessions: [] });
    assert.equal(await refreshWithin(Promise.resolve(), store.records, tabId('w1:t1'), duration(1_000)), 'failed');
});

test('a refresh that does not finish in time is timed out, whatever the tab stores', async () => {
    const store = memoryStore();
    store.records.failRun({ scope: tabId('w1:t1'), at: instant(100), cause: 'requested', backend: null, language: textOf('en'), costUsd: usdOf(0), error: textOf('stale error'), sessions: [] });
    assert.equal(await refreshWithin(never(), store.records, tabId('w1:t1'), duration(10)), 'timed-out');
});

test('a run that fails and then succeeds reads failed, then refreshed, on the tab store', async () => {
    const store = memoryStore();
    store.records.failRun({ scope: tabId('w1:t1'), at: instant(100), cause: 'requested', backend: null, language: textOf('en'), costUsd: usdOf(0), error: textOf(textOf('the summarizer failed')), sessions: [] });
    assert.equal(await refreshWithin(Promise.resolve(), store.records, tabId('w1:t1'), duration(1_000)), 'failed');
    recordOps(store, { scope: tabId('w1:t1'), at: instant(200), cause: 'requested', backend: null, language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [], tasks: [], ops: [] });
    assert.equal(await refreshWithin(Promise.resolve(), store.records, tabId('w1:t1'), duration(1_000)), 'refreshed');
});
