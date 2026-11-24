import { textOf } from '@stateforge-labs/session-ledger';
import { storeRead } from '#test/db/support.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { openStoreAt } from '#src/adapters/db/database.ts';
import { cursor, memoryStore, scratchDir } from './support.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { tabId, paneId } from '#test/support/ids.ts';

test('refresh requests are taken once; one tab asked twice is one request', () => {
    const { requests } = memoryStore();
    assert.deepEqual(requests.takeRequests(), []);
    requests.request(tabId('w1:t1'));
    requests.request(tabId('w1:t2'));
    requests.request(tabId('w1:t1'));
    assert.deepEqual(requests.takeRequests().map(String).toSorted(), ['w1:t1', 'w1:t2']);
    assert.deepEqual(requests.takeRequests(), []);
});

test('visibility requests are taken once, in the order they were made — explicit and toggle alike', () => {
    const { requests } = memoryStore();
    requests.requestVisibility({ target: paneId('w1:t1'), visibility: 'hidden' });
    requests.requestVisibility({ target: paneId('all'), visibility: 'toggle' });
    requests.requestVisibility({ target: paneId('w1:t1'), visibility: 'shown' });
    requests.request(tabId('w1:t5'));
    assert.deepEqual(requests.takeVisibility(), [{ target: 'w1:t1', visibility: 'hidden' }, { target: 'all', visibility: 'toggle' }, { target: 'w1:t1', visibility: 'shown' }]);
    assert.deepEqual(requests.takeVisibility(), []);
    assert.deepEqual(requests.takeRequests().map(String), ['w1:t5'], 'the two queues do not take each other\'s');
});

test('a column asks while the daemon writes: two connections to one file lose nothing (WAL)', () => {
    const dir = scratchDir('wal');
    try {
        const path = join(dir, 'tab-recap.db');
        const [daemon, column] = [openStoreAt(path as FsPath), openStoreAt(path as FsPath)];
        if (daemon.kind !== 'ready' || column.kind !== 'ready') {
            throw new Error('both open');
        }
        const taken: string[] = [];
        for (let at = 0; at < 50; at += 1) {
            daemon.records.advance({ scope: tabId('w1:t1'), at: instant(at), error: null, sessions: [cursor('w1:p1', at)] });
            column.requests.request(tabId(`w1:t${at}`));
            taken.push(...daemon.requests.takeRequests().map(String));
            assert.equal(storeRead(column.records.readRecap(tabId('w1:t1')))?.scope, 'w1:t1', 'the column reads while the daemon writes');
        }
        assert.equal(taken.length, 50);
        assert.equal((daemon.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode, 'wal');
        daemon.checkpoint();
        daemon.close();
        column.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('compact requests keep their pane and note, come out once in order, and do not touch the other queues', () => {
    const { requests } = memoryStore();
    requests.requestCompact({ tab: tabId('w1:t1'), pane: paneId('w1:p2'), note: textOf('the retry test') });
    requests.requestCompact({ tab: tabId('w1:t1'), pane: null, note: null });
    requests.requestCompact({ tab: tabId('w1:t1'), pane: paneId('w1:p3'), note: null, origin: 'auto' });
    requests.request(tabId('w1:t9'));
    assert.deepEqual(requests.takeCompactions(), [
        { tab: 'w1:t1', pane: 'w1:p2', note: 'the retry test', origin: 'operator' }, { tab: 'w1:t1', pane: null, note: null, origin: 'operator' }, { tab: 'w1:t1', pane: 'w1:p3', note: null, origin: 'auto' },
    ]);
    assert.deepEqual(requests.takeCompactions(), []);
    assert.deepEqual(requests.takeRequests().map(String), ['w1:t9']);
});
