import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { productionWiring, type DeliverArguments } from '../bin/handoff.ts';
import { databaseFile, openStoreAt } from '#src/adapters/db/database.ts';
import { codeVersion } from '#src/adapters/os/plugin-version.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { RefreshFirst } from '#src/ports/requests.ts';
import { instant } from '#src/recap/domain/time.ts';
import { paneId, tabId } from '#test/support/ids.ts';

const PANE = paneId('w1:p1');

const request = (refresh: boolean): DeliverArguments => ({ from: PANE, to: PANE, note: null, refresh, closed: { tab: tabId('w1:t1'), pane: PANE, closedAt: instant(1_000) } });

async function refreshReaching(refresh: boolean): Promise<RefreshFirst> {
    const root = mkdtempSync(join(tmpdir(), 'tab-recap-handoff-refresh-'));
    const saved = process.env['TAB_RECAP_STATE'];
    process.env['TAB_RECAP_STATE'] = root;
    try {
        const store = openStoreAt(databaseFile(root as Directory));
        assert.equal(store.kind, 'ready');
        writeFileSync(join(root, 'daemon.pid'), `${process.pid}\n`);
        writeFileSync(join(root, 'daemon.version'), `${codeVersion() ?? 'unknown'}\n`);
        const delivering = productionWiring().deliver(request(refresh));
        let seen: RefreshFirst | null = null;
        while (seen === null) {
            const [row] = store.requests.takeHandoffs();
            if (row !== undefined) {
                seen = row.refresh;
                store.handoffs.answerHandoff(row.id, { kind: 'failed', reason: 'interrupted' });
            } else {
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }
        assert.equal((await delivering).kind, 'failed');
        store.close();
        return seen;
    } finally {
        if (saved === undefined) {
            delete process.env['TAB_RECAP_STATE'];
        } else {
            process.env['TAB_RECAP_STATE'] = saved;
        }
        rmSync(root, { recursive: true, force: true });
    }
}

test('the production handoff wiring queues refresh true as refresh-first and false as as-is', async () => {
    assert.equal(await refreshReaching(true), 'refresh-first');
    assert.equal(await refreshReaching(false), 'as-is');
});
