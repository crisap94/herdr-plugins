import { tabId } from '#test/support/ids.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseDirectory } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupsOf } from '@stateforge-labs/session-ledger-sqlite/unstable/backup.ts';
import { connect, connectReadOnly } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';
import { latestVersion, versionOf } from '@stateforge-labs/session-ledger-sqlite/unstable/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { notReadyLine, openCliStore } from '#src/daemon/cli-store.ts';
import { messagesOf } from '#src/daemon/config.ts';
import { openStateAt } from '#src/daemon/state.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { parseText } from '@stateforge-labs/session-ledger';

const KEYS = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_STATE', 'TAB_RECAP_LOCALE'] as const;
const LATEST = latestVersion(MIGRATIONS);
const notifier = { notify: (): Promise<{ kind: 'shown' }> => Promise.resolve({ kind: 'shown' }) };

async function daemonStore(state: string): Promise<Store> {
    const store = await openStateAt(must(parseDirectory(state)), notifier, () => undefined);
    if (store === null) {
        assert.fail('the daemon opens the store as owner');
    }
    return store;
}

async function withState(body: (state: string, file: string) => Promise<void> | void): Promise<void> {
    const saved = KEYS.map((key) => process.env[key]);
    const root = mkdtempSync(join(tmpdir(), 'recap-cli-role-'));
    const state = join(root, 'state');
    process.env['HERDR_PLUGIN_CONFIG_DIR'] = join(root, 'config');
    process.env['TAB_RECAP_STATE'] = state;
    process.env['TAB_RECAP_LOCALE'] = 'en';
    try {
        await body(state, join(state, 'tab-recap.db'));
    } finally {
        KEYS.forEach((key, index) => {
            const value = saved[index];
            if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; }
        });
        rmSync(root, { recursive: true, force: true });
    }
}

function behind(file: string): void {
    mkdirSync(join(file, '..'), { recursive: true });
    const opened = openDatabase(fsPathOf(file), MIGRATIONS.slice(0, -1));
    opened.db.close();
}

function versionAt(file: string): number {
    const db = connectReadOnly(file);
    const found = versionOf(db);
    db.close();
    return found;
}

test('R1: the daemon opens an empty state folder as owner and creates the store at the latest version', async () => {
    await withState(async (state, file) => {
        (await daemonStore(state)).close();
        assert.equal(versionAt(file), LATEST);
    });
});

test('R2: the daemon migrates a store that is behind and keeps one backup', async () => {
    await withState(async (state, file) => {
        behind(file);
        (await daemonStore(state)).close();
        assert.equal(versionAt(file), LATEST);
        assert.equal(backupsOf(file).length, 1);
    });
});

test('R3: the CLI opens an empty state folder as reader: stale, no file, a line naming tab-recap start', async () => {
    await withState((_state, file) => {
        const opened = openCliStore();
        if (opened.kind !== 'stale-store') {
            assert.fail(`expected stale-store, got ${opened.kind}`);
        }
        assert.equal(opened.found, 0);
        assert.equal(opened.known, LATEST);
        assert.equal(notReadyLine(opened, messagesOf()), `the state store is at v0, this plugin needs v${LATEST} — start the daemon: tab-recap start`);
        assert.equal(existsSync(file), false);
    });
});

test('R4: the CLI on a store that is behind reports stale and leaves the file and its version alone', async () => {
    await withState((_state, file) => {
        behind(file);
        const opened = openCliStore();
        if (opened.kind !== 'stale-store') {
            assert.fail(`expected stale-store, got ${opened.kind}`);
        }
        assert.equal(opened.found, LATEST - 1);
        opened.close();
        assert.equal(versionAt(file), LATEST - 1);
        assert.deepEqual(backupsOf(file), []);
    });
});

test('R5: the CLI on a current store writes a request that the daemon takes', async () => {
    await withState(async (state) => {
        (await daemonStore(state)).close();
        const reader = openCliStore();
        if (reader.kind !== 'ready') {
            assert.fail(`expected ready, got ${reader.kind}`);
        }
        reader.requests.request(tabId('w1:t1'));
        reader.close();
        const again = await daemonStore(state);
        assert.deepEqual(again.requests.takeRequests(), ['w1:t1']);
        again.close();
    });
});

test('R6: the CLI on a store newer than its code reports newer-db with today\'s line', async () => {
    await withState((_state, file) => {
        behind(file);
        const db = connect(file);
        db.exec(`PRAGMA user_version = ${LATEST + 1}`);
        db.close();
        const opened = openCliStore();
        if (opened.kind !== 'newer-db') {
            assert.fail(`expected newer-db, got ${opened.kind}`);
        }
        assert.equal(opened.found, LATEST + 1);
        assert.equal(opened.known, LATEST);
        assert.equal(notReadyLine(opened, messagesOf()), messagesOf().database.newer(opened.backup === null ? null : must(parseText(opened.backup))));
        assert.equal(versionAt(file), LATEST + 1);
    });
});
