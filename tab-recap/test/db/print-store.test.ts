import { storeRead } from '#test/db/support.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { connectReadOnly } from '#src/adapters/db/connection.ts';
import { versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { openPrintStore } from '#src/adapters/db/print-store.ts';
import { RecapRecordsRepository } from '#src/adapters/db/recap-records.ts';
import { TabViewRowStore } from '#src/adapters/db/tab-views.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { closedDaysOf as closedLaneDaysOf } from '../fakes/closed-days.ts';
import { scratchDir } from './support.ts';
import { must } from '#src/protocol/result.ts';
import { parseFsPath, fsPathOf } from '#src/recap/domain/fs-path.ts';
import { instant } from '#src/recap/domain/time.ts';
import { tabId, paneId } from '#test/support/ids.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { usdOf } from '#src/recap/domain/usd.ts';
import { viewRecord } from '#test/support/tab-view-records.ts';

const BEFORE_HANDOFF = 18;

const rowCounts = (path: string): readonly number[] => {
    const db = connectReadOnly(path);
    try {
        return ['tab', 'lane', 'run', 'request'].map((table) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
    } finally {
        db.close();
    }
};

test('print reads a database not yet upgraded to the handoff tables, and writes no row and no schema', () => {
    const dir = scratchDir('print-store');
    try {
        const path = join(dir, 'tab-recap.db');
        const seeded = openDatabase(fsPathOf(path), MIGRATIONS.slice(0, BEFORE_HANDOFF));
        assert.equal(seeded.kind, 'ready');
        const at = 1_000;
        new RecapRecordsRepository(seeded.db).recordRun({ scope: tabId('w1:t1'), at: instant(at), cause: 'focused', backend: null, language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [], tasks: [], changed: [], refused: [] });
        new TabViewRowStore(seeded.db).writeTab(viewRecord({ tab: 'w1:t1', column: null, at, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null, cwd: null }] }));
        seeded.db.close();
        const before = rowCounts(path);

        const print = openPrintStore(must(parseFsPath(path)), closedLaneDaysOf('14'));
        assert.equal(storeRead(print.records.readRecap(tabId('w1:t1')))?.scope, 'w1:t1', 'the recap reads');
        assert.deepEqual(storeRead(print.records.lastRunOf(tabId('w1:t1'))), { at, cause: 'focused' });
        assert.equal(print.views.tabOf(paneId('w1:p1')), 'w1:t1');
        assert.equal(print.views.readTab(tabId('w1:t1'))?.lanes.length, 1);
        assert.throws(() => { print.views.writeTab(viewRecord({ tab: 'w1:t1', column: null, at: 2, lanes: [] })); }, /readonly/i, 'the handle refuses a write');
        print.close();

        const after = connectReadOnly(path);
        assert.equal(versionOf(after), BEFORE_HANDOFF, 'the schema is not upgraded');
        after.close();
        assert.deepEqual(rowCounts(path), before, 'no row is written');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
