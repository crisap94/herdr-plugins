import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { openStore } from '#src/adapters/db/database.ts';
import { cursor, memoryStore, scratchDir } from './support.ts';

test('refresh requests are taken once; one tab asked twice is one request', () => {
    const { requests } = memoryStore();
    assert.deepEqual(requests.takeRequests(), []);
    requests.request('w1:t1');
    requests.request('w1:t2');
    requests.request('w1:t1');
    assert.deepEqual(requests.takeRequests().map(String).toSorted(), ['w1:t1', 'w1:t2']);
    assert.deepEqual(requests.takeRequests(), []);
});

test('visibility requests are taken once, in the order they were made — explicit and toggle alike', () => {
    const { requests } = memoryStore();
    requests.requestVisibility({ target: 'w1:t1', hidden: true });
    requests.requestVisibility({ target: 'all', hidden: 'toggle' });
    requests.requestVisibility({ target: 'w1:t1', hidden: false });
    requests.request('w1:t5');
    assert.deepEqual(requests.takeVisibility(), [{ target: 'w1:t1', hidden: true }, { target: 'all', hidden: 'toggle' }, { target: 'w1:t1', hidden: false }]);
    assert.deepEqual(requests.takeVisibility(), []);
    assert.deepEqual(requests.takeRequests().map(String), ['w1:t5'], 'the two queues do not take each other\'s');
});

test('a column asks while the daemon writes: two connections to one file lose nothing (WAL)', () => {
    const dir = scratchDir('wal');
    try {
        const path = join(dir, 'tab-recap.db');
        const [daemon, column] = [openStore(path), openStore(path)];
        if (daemon.kind !== 'ready' || column.kind !== 'ready') {
            throw new Error('both open');
        }
        const taken: string[] = [];
        for (let at = 0; at < 50; at += 1) {
            daemon.records.advance({ tab: 'w1:t1', at, error: null, lanes: [cursor('w1:p1', at)] });
            column.requests.request(`w1:t${at}`);
            taken.push(...daemon.requests.takeRequests().map(String));
            assert.equal(column.records.readRecap('w1:t1')?.tab, 'w1:t1', 'the column reads while the daemon writes');
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
    requests.requestCompact({ tab: 'w1:t1', pane: 'w1:p2', note: 'the retry test' });
    requests.requestCompact({ tab: 'w1:t1', pane: null, note: null });
    requests.request('w1:t9');
    assert.deepEqual(requests.takeCompactions(), [{ tab: 'w1:t1', pane: 'w1:p2', note: 'the retry test' }, { tab: 'w1:t1', pane: null, note: null }]);
    assert.deepEqual(requests.takeCompactions(), []);
    assert.deepEqual(requests.takeRequests().map(String), ['w1:t9']);
});
