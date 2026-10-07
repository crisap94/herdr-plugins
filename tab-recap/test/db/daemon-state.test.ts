import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { latestVersion } from '#src/adapters/db/migrate.ts';
import { databasePath } from '#src/adapters/db/database.ts';
import { openState } from '#src/daemon/state.ts';
import type { Notified, Notifier } from '#src/ports/notifier.ts';
import { scratchDir } from './support.ts';
import { everyShape, put, sections } from './import/support.ts';

const recorder = (): { notifier: Notifier; told: string[]; lines: string[] } => {
    const told: string[] = [];
    return { told, lines: [], notifier: { notify: (_title, body): Promise<Notified> => { told.push(body); return Promise.resolve({ kind: 'shown' }); } } };
};

test('the daemon starts on a state directory of the old files: it imports once, says so, and the files move aside', async () => {
    const dir = scratchDir('daemon-import');
    try {
        everyShape(dir);
        const { notifier, told } = recorder();
        const lines: string[] = [];
        const store = await openState(dir, notifier, (line) => { lines.push(line); });
        if (store === null) {
            assert.fail('the daemon starts');
        }
        assert.match(lines.join('\n'), /imported 6 recaps, 3 views, 3 requests; the files are in .*legacy-files-/);
        assert.deepEqual(told, []);
        assert.equal(store.records.readRecap('w1:t1')?.tasks.at(0)?.sections?.goal, 'ship');
        store.close();
        assert.ok(!existsSync(join(dir, 'recaps')));
        const again = await openState(dir, notifier, (line) => { lines.push(line); });
        assert.notEqual(again, null, 'a second start does not import again, and starts');
        again?.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a failed import: logged, shown on screen, the daemon does not run, the files are untouched', async () => {
    const dir = scratchDir('daemon-failed');
    try {
        everyShape(dir);
        put(dir, 'recaps', 'w1_t1.json', { tab: 'w1:t1', lanes: [], at: 1, running: false, backend: null, error: null, costUsd: 0, tasks: [{ id: 't1', name: '', lanes: [], sections: { ...sections, now: ['1', '2', '3', '4'] }, markdown: 'x' }] });
        const { notifier, told } = recorder();
        const lines: string[] = [];
        assert.equal(await openState(dir, notifier, (line) => { lines.push(line); }), null);
        assert.match(lines.join('\n'), /could not move the state files into the database .*recap w1:t1.*untouched/);
        assert.equal(told.length, 1);
        assert.ok(existsSync(join(dir, 'recaps')));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a database newer than this plugin: the daemon says which backup to restore, shows it, and does not run', async () => {
    const dir = scratchDir('daemon-newer');
    // the messages asserted below are English whatever the machine's locale
    const locale = process.env['TAB_RECAP_LOCALE'];
    process.env['TAB_RECAP_LOCALE'] = 'en';
    try {
        const db = new DatabaseSync(databasePath(dir));
        db.exec(`PRAGMA user_version = ${latestVersion() + 1}`);
        db.close();
        const { notifier, told } = recorder();
        const lines: string[] = [];
        assert.equal(await openState(dir, notifier, (line) => { lines.push(line); }), null);
        assert.match(told.join(), /database is newer than this plugin — restore a backup or upgrade/);
        assert.match(lines.join(), /newer than this plugin/);
    } finally {
        if (locale === undefined) {
            delete process.env['TAB_RECAP_LOCALE'];
        } else {
            process.env['TAB_RECAP_LOCALE'] = locale;
        }
        rmSync(dir, { recursive: true, force: true });
    }
});
