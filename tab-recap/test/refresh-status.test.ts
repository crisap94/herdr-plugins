import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshStatusOf } from '#src/recap/domain/freshness.ts';
import { refreshedWithin } from '#src/daemon/refresh-status.ts';
import { memoryStore } from './db/support.ts';

const never = (): Promise<void> => new Promise<void>(() => undefined);

test('a waited refresh is timed out whatever the tab says, and otherwise refreshed or failed by the stored error', () => {
    assert.deepEqual([
        refreshStatusOf('done', null),
        refreshStatusOf('done', 'the summarizer failed'),
        refreshStatusOf('timeout', null),
        refreshStatusOf('timeout', 'the summarizer failed'),
    ], ['refreshed', 'failed', 'timed-out', 'timed-out']);
});

test('a refresh that finishes with no stored error is refreshed', async () => {
    assert.equal(await refreshedWithin(Promise.resolve(), memoryStore().records, 'w1:t1', 1_000), 'refreshed');
});

test('a refresh that finishes with a stored error is failed', async () => {
    const store = memoryStore();
    store.records.failRun({ tab: 'w1:t1', at: 100, cause: 'requested', backend: null, language: 'en', costUsd: 0, error: 'the summarizer failed', lanes: [] });
    assert.equal(await refreshedWithin(Promise.resolve(), store.records, 'w1:t1', 1_000), 'failed');
});

test('a refresh that does not finish in time is timed out, whatever the tab stores', async () => {
    const store = memoryStore();
    store.records.failRun({ tab: 'w1:t1', at: 100, cause: 'requested', backend: null, language: 'en', costUsd: 0, error: 'stale error', lanes: [] });
    assert.equal(await refreshedWithin(never(), store.records, 'w1:t1', 10), 'timed-out');
});

test('a run that fails and then succeeds reads failed, then refreshed, on the tab store', async () => {
    const store = memoryStore();
    store.records.failRun({ tab: 'w1:t1', at: 100, cause: 'requested', backend: null, language: 'en', costUsd: 0, error: 'the summarizer failed', lanes: [] });
    assert.equal(await refreshedWithin(Promise.resolve(), store.records, 'w1:t1', 1_000), 'failed');
    store.records.recordRun({ tab: 'w1:t1', at: 200, cause: 'requested', backend: null, language: 'en', costUsd: 0, error: null, lanes: [], tasks: [], ops: [] });
    assert.equal(await refreshedWithin(Promise.resolve(), store.records, 'w1:t1', 1_000), 'refreshed');
});
