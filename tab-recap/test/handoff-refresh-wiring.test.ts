import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

function restore(key: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }
}

async function refreshReaching(refresh: boolean): Promise<RefreshFirst> {
    const root = mkdtempSync(join(tmpdir(), 'tab-recap-handoff-refresh-'));
    const saved = { state: process.env['TAB_RECAP_STATE'], config: process.env['HERDR_PLUGIN_CONFIG_DIR'] };
    process.env['TAB_RECAP_STATE'] = root;
    process.env['HERDR_PLUGIN_CONFIG_DIR'] = join(root, 'config');
    mkdirSync(join(root, 'config'));
    try {
        const store = openStoreAt(databaseFile(root as Directory));
        assert.equal(store.kind, 'ready');
        writeFileSync(join(root, 'daemon.pid'), `${process.pid}\n`);
        writeFileSync(join(root, 'daemon.version'), `${codeVersion() ?? 'unknown'}\n`);
        const delivering = productionWiring().deliver(request(refresh));
        let seen: RefreshFirst | null = null;
        for (let tries = 0; seen === null && tries < 1_000; tries += 1) {
            const [row] = store.requests.takeHandoffs();
            if (row === undefined) {
                await new Promise((resolve) => setTimeout(resolve, 10));
                continue;
            }
            seen = row.refresh;
            store.handoffs.answerHandoff(row.id, { kind: 'failed', reason: 'interrupted' });
        }
        const outcome = await delivering;
        store.close();
        assert.notEqual(seen, null, `deliver settled as ${outcome.kind} before queueing a request`);
        assert.equal(outcome.kind, 'failed');
        return seen ?? 'as-is';
    } finally {
        restore('TAB_RECAP_STATE', saved.state);
        restore('HERDR_PLUGIN_CONFIG_DIR', saved.config);
        rmSync(root, { recursive: true, force: true });
    }
}

test('the production handoff wiring queues refresh true as refresh-first and false as as-is', async () => {
    assert.equal(await refreshReaching(true), 'refresh-first');
    assert.equal(await refreshReaching(false), 'as-is');
});
