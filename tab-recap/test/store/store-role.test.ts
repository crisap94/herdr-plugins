import { tabId } from '#src/recap/domain/ids.ts';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { databaseFile, openStoreAt } from '#src/adapters/db/database.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';

test('a reader on a current file writes a request that the owner reads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-role-'));
    const file = databaseFile(must(parseDirectory(dir)));
    try {
        const owner = openStoreAt(file);
        if (owner.kind !== 'ready') {
            assert.fail('the owner opens a fresh store');
        }
        owner.close();

        const reader = openStoreAt(file, {}, 'reader');
        if (reader.kind !== 'ready') {
            assert.fail('the reader opens a current store');
        }
        reader.requests.request(tabId('tab-1'));
        reader.close();

        const again = openStoreAt(file);
        if (again.kind !== 'ready') {
            assert.fail('the owner reopens the current store');
        }
        assert.deepEqual(again.requests.takeRequests(), ['tab-1']);
        again.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a reader on a missing store reports stale-store and creates no file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-role-'));
    try {
        const missing = join(dir, 'state');
        const reader = openStoreAt(databaseFile(must(parseDirectory(missing))), {}, 'reader');
        if (reader.kind !== 'stale-store') {
            assert.fail('a reader on a missing store is stale');
        }
        assert.equal(reader.found, 0);
        assert.equal(existsSync(databaseFile(must(parseDirectory(missing)))), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
