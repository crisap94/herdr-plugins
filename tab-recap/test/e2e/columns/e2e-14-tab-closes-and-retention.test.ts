import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Method } from '@stateforge-labs/herdr-sdk';
import { scratchStore, type Scratch } from '#src/adapters/db/scratch.ts';
import { forgetClosedTabs } from '#src/daemon/retention.ts';
import { viewRecord } from '#test/support/tab-view-records.ts';
import { columnsWorld, paneOpened, type Cells, type ColumnsWorld, type TabSpec } from '../support/columns-world.ts';

interface Targeted {
    readonly pane_id: string;
}

interface Reported {
    readonly workspace_id?: string;
    readonly tokens?: Readonly<Record<string, string | null>>;
}

const cells = (x: number, y: number, width: number, height: number): Cells => ({ x, y, width, height });

const AREA = cells(0, 0, 189, 40);
const TAB = 'w2:t4';
const AGENT = 'w2:p1';
const COLUMN = 'w2:p9';
const GRACE = 3_000;

const withAgent: TabSpec = { tab: TAB, area: AREA, panes: [{ id: AGENT, agent: 'claude', tab: TAB, rect: AREA }], splits: [] };
const withColumn: TabSpec = {
    tab: TAB,
    area: AREA,
    panes: [{ id: AGENT, agent: 'claude', tab: TAB, rect: cells(0, 0, 100, 40) }, { id: COLUMN, title: 'tab-recap', label: 'Recap', tab: TAB, rect: cells(101, 0, 88, 40) }],
    splits: [{ direction: 'right', ratio: 0.5, rect: AREA }],
};
const columnOnly: TabSpec = { tab: TAB, area: AREA, panes: [{ id: COLUMN, title: 'tab-recap', label: 'Recap', tab: TAB, rect: AREA }], splits: [] };

const nap = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('the last agent of a tab closes and herdr keeps listing the column', () => {
    let world: ColumnsWorld;
    let firstClose = 0;
    let secondClose = 0;

    const closes = (): readonly string[] => world.requests('pane.close').map((request) => (request.params as Targeted).pane_id);
    const told = (): readonly string[] => world.requests('workspace.report_metadata').flatMap((request) => {
        const params = request.params as Reported;
        return Object.values(params.tokens ?? {}).flatMap((value) => (typeof value === 'string' ? [`${params.workspace_id ?? ''} ${value}`] : []));
    });

    before(async () => {
        world = await columnsWorld({ TAB_RECAP_CLOSE_GRACE_MS: String(GRACE), TAB_RECAP_HERDR_EVENTS: 'on' });
        world.world.herdr.reply(Method.PluginPaneOpen, paneOpened(COLUMN, TAB) as never);
        world.world.herdr.reply('workspace.report_metadata' as never, { type: 'ok' } as never);
        world.world.herdr.reply('workspace.list' as never, { type: 'workspace_list', workspaces: [{ workspace_id: 'w2' }] } as never);
        await world.opened([withAgent], [withColumn]);
        world.show(columnOnly);
        world.world.herdr.push({ event: 'pane_closed', data: { type: 'pane_closed', pane_id: AGENT } });
        await world.awaitRequest('pane.close');
        firstClose = Date.now();
    });

    after(async () => {
        await world.close();
    });

    test('the column of that tab is closed', { timeout: 30_000 }, () => {
        assert.deepEqual(closes(), [COLUMN]);
    });

    test('inside the grace time nothing closes it again, however often herdr reports a change', { timeout: 30_000 }, async () => {
        for (let at = 0; at < 3; at += 1) {
            const asked = world.requests('session.snapshot').length;
            world.world.herdr.push({ event: 'layout_updated', data: { type: 'layout_updated', tab_id: TAB } });
            const deadline = Date.now() + 5_000;
            while (world.requests('session.snapshot').length === asked && Date.now() < deadline) {
                await nap(10);
            }
        }
        assert.ok(Date.now() - firstClose < GRACE, 'the check ran inside the grace time');
        assert.deepEqual(closes(), [COLUMN]);
    });

    test('the closure is announced on the workspace of the tab, the part of the id before the colon', { timeout: 30_000 }, async () => {
        const deadline = Date.now() + 15_000;
        while (!told().some((entry) => /^w2 [0-9a-z]+:lane-closed:w2:p1$/u.test(entry)) && Date.now() < deadline) {
            await nap(25);
        }
        assert.ok(told().some((entry) => /^w2 [0-9a-z]+:lane-closed:w2:p1$/u.test(entry)), told().join('; '));
    });

    test('after the grace time the next change closes it again', { timeout: 30_000 }, async () => {
        const deadline = Date.now() + 20_000;
        while (closes().length < 2 && Date.now() < deadline) {
            world.world.herdr.push({ event: 'layout_updated', data: { type: 'layout_updated', tab_id: TAB } });
            await nap(250);
        }
        secondClose = Date.now();
        assert.deepEqual(closes(), [COLUMN, COLUMN]);
        assert.ok(secondClose - firstClose >= GRACE - 200, `${secondClose - firstClose} ms between the two closes`);
    });
});

const DAY = 86_400_000;

describe('the daemon is down while the last agent of a tab closes', () => {
    let world: ColumnsWorld;

    const told = (): readonly string[] => world.requests('workspace.report_metadata').flatMap((request) => {
        const params = request.params as Reported;
        return Object.values(params.tokens ?? {}).flatMap((value) => (typeof value === 'string' ? [`${params.workspace_id ?? ''} ${value}`] : []));
    });

    before(async () => {
        world = await columnsWorld({ TAB_RECAP_HERDR_EVENTS: 'on' });
        world.world.herdr.reply(Method.PluginPaneOpen, paneOpened(COLUMN, TAB) as never);
        world.world.herdr.reply('workspace.report_metadata' as never, { type: 'ok' } as never);
        world.world.herdr.reply('workspace.list' as never, { type: 'workspace_list', workspaces: [{ workspace_id: 'w2' }] } as never);
        await world.opened([withAgent], [withColumn]);
        const running = world.world.pidfile().pid;
        assert.notEqual(running, null);
        process.kill(running ?? -1, 'SIGTERM');
        await world.world.awaitGone(running ?? -1);
        world.show(columnOnly);
        world.world.daemon();
    });

    after(async () => {
        await world.close();
    });

    test('the lanes it persisted are restored: the closure is announced on the workspace of the tab when it starts again', { timeout: 30_000 }, async () => {
        const deadline = Date.now() + 15_000;
        while (!told().some((entry) => /^w2 [0-9a-z]+:lane-closed:w2:p1$/u.test(entry)) && Date.now() < deadline) {
            await nap(25);
        }
        assert.ok(told().some((entry) => /^w2 [0-9a-z]+:lane-closed:w2:p1$/u.test(entry)), told().join('; '));
    });
});

describe('a tab is forgotten after the retention time, a tab seen again is not', () => {
    const scratchFolder = mkdtempSync(join(tmpdir(), 'tab-recap-retention-e2e-'));
    const keys = ['TAB_RECAP_KEEP_DAYS', 'HERDR_PLUGIN_CONFIG_DIR'] as const;
    const saved = new Map<string, string | undefined>();
    const lines: string[] = [];
    let held: Scratch;
    let now = 0;

    const seen = (tab: string, at: number, column: string | null = null): void => {
        held.store.views.writeTab(viewRecord({ tab, column, at, daemonVersion: '3.7.6', lanes: [] }));
    };
    const tabs = (): readonly string[] => held.store.db.prepare('SELECT id FROM tab ORDER BY id').all().map((row) => (row as { id: string }).id);

    before(() => {
        for (const key of keys) {
            saved.set(key, process.env[key]);
        }
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = scratchFolder;
        process.env['TAB_RECAP_KEEP_DAYS'] = '30';
        writeFileSync(join(scratchFolder, 'config.env'), '');
        held = scratchStore();
        now = Date.now();
        seen('w9:old', now - 40 * DAY);
        seen('w9:recent', now - 3 * DAY);
        seen('w9:shown', now - 40 * DAY, 'w9:p9');
        seen('w9:again', now - 1 * DAY);
        seen('w9:again', now - 40 * DAY);
        forgetClosedTabs(held.store, (line) => { lines.push(String(line)); });
    });

    after(() => {
        held.dispose();
        for (const [key, value] of saved) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        rmSync(scratchFolder, { recursive: true, force: true });
    });

    test('a closed tab not seen for the retention time is forgotten, and the log says so', { timeout: 30_000 }, () => {
        assert.ok(!tabs().includes('w9:old'));
        assert.equal(lines.filter((line) => line.startsWith('retention: removed w9:old ')).length, 1);
    });

    test('a tab seen inside the retention time, and a tab that still has its column, stay', { timeout: 30_000 }, () => {
        assert.ok(tabs().includes('w9:recent'));
        assert.ok(tabs().includes('w9:shown'));
    });

    test('a tab seen again keeps its later last-seen when an earlier time is written, and is not swept', { timeout: 30_000 }, () => {
        assert.ok(tabs().includes('w9:again'));
        assert.deepEqual(lines.filter((line) => line.includes('w9:again')), []);
    });
});
