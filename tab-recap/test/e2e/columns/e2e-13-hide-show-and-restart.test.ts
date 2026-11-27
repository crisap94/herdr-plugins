import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { Method } from '@stateforge-labs/herdr-sdk';
import { columnsWorld, paneOpened, type Cells, type ColumnsWorld, type TabSpec } from '../support/columns-world.ts';
import { recapDaemonWorld, type RecapDaemonWorld } from '../support/recap-daemon-world.ts';
import { add } from '../support/engine-world.ts';

interface Opened {
    readonly env: Readonly<Record<string, string>>;
}

interface Targeted {
    readonly pane_id: string;
}

const cells = (x: number, y: number, width: number, height: number): Cells => ({ x, y, width, height });

const AREA = cells(0, 0, 189, 40);
const AGENT_OF: Readonly<Record<string, string>> = { 'w1:t1': 'w1:p1', 'w1:t2': 'w1:p2', 'w1:t3': 'w1:p3' };
const COLUMNS = Array.from({ length: 16 }, (_, at) => `w1:p${20 + at}`);
const STRAY = 'w1:p40';

const nap = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('hide and show one tab, then all tabs, then restart the daemon', () => {
    let world: ColumnsWorld;
    let alive = -1;
    let tabs: readonly string[] = ['w1:t1', 'w1:t2'];
    let stray: string | null = null;

    const opens = (): readonly string[] => world.requests('plugin.pane.open').map((request) => (request.params as Opened).env['TAB_RECAP_TAB'] ?? '');
    const closes = (): readonly string[] => world.requests('pane.close').map((request) => (request.params as Targeted).pane_id);
    const columnOf = (tab: string): string | null => {
        const at = opens().findLastIndex((opened) => opened === tab);
        const pane = at < 0 ? null : (COLUMNS[at] ?? null);
        return pane !== null && !closes().includes(pane) ? pane : null;
    };

    const specOf = (tab: string): TabSpec => {
        const column = columnOf(tab) ?? (tab === 'w1:t1' ? stray : null);
        const agent = AGENT_OF[tab] ?? '';
        return column === null
            ? { tab, area: AREA, panes: [{ id: agent, agent: 'claude', tab, rect: AREA }], splits: [] }
            : {
                tab,
                area: AREA,
                panes: [{ id: agent, agent: 'claude', tab, rect: cells(0, 0, 100, 40) }, { id: column, title: 'tab-recap', label: 'Recap', tab, rect: cells(101, 0, 88, 40) }],
                splits: [{ direction: 'right', ratio: 0.5, rect: AREA }],
            };
    };

    const sync = (): void => { world.show(...tabs.map(specOf)); };

    const following = { on: true, seen: '', told: 0 };

    const follow = async (): Promise<void> => {
        while (following.on) {
            const now = `${opens().length}/${closes().length}`;
            if (now !== following.seen) {
                following.seen = now;
                sync();
                for (const pane of closes().slice(following.told)) {
                    world.world.herdr.push({ event: 'pane_closed', data: { type: 'pane_closed', pane_id: pane } });
                }
                following.told = closes().length;
            }
            await new Promise<void>((resolve) => { setImmediate(resolve); });
        }
    };

    const press = async (command: 'column' | 'columns'): Promise<void> => {
        const ran = await world.world.command(command);
        assert.equal(ran.code, 0, ran.stderr);
    };

    const stopDaemon = async (): Promise<void> => {
        assert.ok(alive > 0);
        process.kill(alive, 'SIGTERM');
        await world.world.awaitGone(alive);
    };

    const startDaemon = async (): Promise<number> => {
        const subscribed = world.requests('events.subscribe').length;
        const from = world.world.log().length;
        alive = world.world.daemon().pid;
        await world.world.awaitLog(/daemon \d+ up, state in \S+/, { after: from });
        await world.awaitRequest('events.subscribe', subscribed + 1);
        await world.quiet();
        return from;
    };

    before(async () => {
        world = await columnsWorld();
        world.world.herdr.replySequence(Method.PluginPaneOpen, COLUMNS.map((pane) => ({ result: paneOpened(pane) as never })));
        sync();
        void follow();
        await world.started();
        const named = world.world.pidfile().pid;
        assert.notEqual(named, null);
        alive = named ?? -1;
        await world.awaitRequest('plugin.pane.open', 2);
    });

    after(async () => {
        following.on = false;
        await world.close();
    });

    test('a tab that has an agent gets its column: one for each of the two tabs', { timeout: 30_000 }, () => {
        assert.deepEqual(opens().toSorted(), ['w1:t1', 'w1:t2']);
        assert.deepEqual(closes(), []);
    });

    test('column hides this tab\'s column and leaves the other', { timeout: 30_000 }, async () => {
        const mine = columnOf('w1:t1');
        assert.notEqual(mine, null);
        await press('column');
        await world.awaitRequest('pane.close');
        assert.deepEqual(closes(), [mine]);
        assert.notEqual(columnOf('w1:t2'), null);
        await world.quiet();
        assert.equal(opens().length, 2, 'no column was opened for the hidden tab');
    });

    test('a column herdr lists for the hidden tab is closed, and none is opened in its place', { timeout: 30_000 }, async () => {
        stray = STRAY;
        sync();
        world.world.herdr.push({ event: 'pane_created', data: { type: 'pane_created', pane: { pane_id: STRAY, tab_id: 'w1:t1', workspace_id: 'w1', agent_status: 'idle', focused: false, revision: 1, terminal_id: `term-${STRAY}` } } });
        await world.awaitRequest('pane.close', 2);
        assert.deepEqual(closes().slice(1), [STRAY]);
        stray = null;
        await world.quiet();
        assert.equal(opens().length, 2);
    });

    test('column again shows it: a new column is opened for that tab only', { timeout: 30_000 }, async () => {
        await press('column');
        await world.awaitRequest('plugin.pane.open', 3);
        assert.deepEqual(opens().slice(2), ['w1:t1']);
        assert.equal(closes().length, 2);
    });

    test('columns hides every column', { timeout: 30_000 }, async () => {
        const open = ['w1:t1', 'w1:t2'].flatMap((tab) => columnOf(tab) ?? []);
        await press('columns');
        await world.awaitRequest('pane.close', 4);
        assert.deepEqual(closes().slice(2).toSorted(), open.toSorted());
        await world.quiet();
        assert.equal(opens().length, 3);
    });

    test('columns again shows every column', { timeout: 30_000 }, async () => {
        await press('columns');
        await world.awaitRequest('plugin.pane.open', 5);
        assert.deepEqual(opens().slice(3).toSorted(), ['w1:t1', 'w1:t2']);
    });

    test('hidden again, the state survives a restart: the new daemon opens no column for any tab', { timeout: 60_000 }, async () => {
        await press('columns');
        await world.awaitRequest('pane.close', 6);
        const had = opens().length;
        await stopDaemon();
        const from = await startDaemon();
        assert.equal(opens().length, had);
        assert.doesNotMatch(world.world.log().slice(from), /restored lanes/u);
    });

    test('a tab that appears while all are hidden stays hidden', { timeout: 30_000 }, async () => {
        tabs = ['w1:t1', 'w1:t2', 'w1:t3'];
        const had = opens().length;
        sync();
        world.world.herdr.push({ event: 'pane_agent_detected', data: { type: 'pane_agent_detected', pane: { pane_id: 'w1:p3', tab_id: 'w1:t3', workspace_id: 'w1', agent: 'claude', agent_status: 'idle', cwd: '/work', foreground_cwd: '/work', focused: false, revision: 1, terminal_id: 'term-w1:p3' } } });
        await world.quiet();
        assert.equal(opens().length, had);
    });

    test('column shows one tab under the blanket: only that tab gets its column', { timeout: 30_000 }, async () => {
        await press('column');
        await world.awaitRequest('plugin.pane.open', 6);
        assert.equal(opens().at(-1), 'w1:t1');
        await world.quiet();
        assert.equal(opens().length, 6, 'the other tabs stay hidden');
    });

    test('column again takes that tab out of the shown ones: its column closes', { timeout: 30_000 }, async () => {
        const mine = columnOf('w1:t1');
        await press('column');
        await world.awaitRequest('pane.close', 7);
        assert.equal(closes().at(-1), mine);
        await world.quiet();
        assert.equal(opens().length, 6);
    });

    test('columns then shows all the tabs, the one that appeared included', { timeout: 30_000 }, async () => {
        await press('columns');
        await world.awaitRequest('plugin.pane.open', 9);
        assert.deepEqual(opens().slice(6).toSorted(), ['w1:t1', 'w1:t2', 'w1:t3']);
    });

    test('persisted lanes that cannot be read are logged without their content, and the hidden state still comes back', { timeout: 60_000 }, async () => {
        await press('column');
        const closed = closes().length;
        await world.awaitRequest('pane.close', closed + 1);
        await stopDaemon();
        const db = new Database(join(world.world.stateDir, 'tab-recap.db'));
        try {
            assert.ok(((db.prepare('SELECT count(*) AS n FROM lane').get() as { n: number }).n) > 0);
            db.exec("UPDATE lane SET agent = ''");
        } finally {
            db.close();
        }
        world.show(...tabs.map((tab) => ({ tab, area: AREA, panes: [{ id: AGENT_OF[tab] ?? '', agent: 'claude', tab, rect: AREA }], splits: [] } satisfies TabSpec)));
        const had = opens().length;
        const from = world.world.log().length;
        alive = world.world.daemon().pid;
        await world.world.awaitLog(/daemon \d+ up, state in \S+/, { after: from });
        await world.awaitRequest('plugin.pane.open', had + 2);
        await world.quiet();
        assert.deepEqual(opens().slice(had).toSorted(), ['w1:t2', 'w1:t3']);
        const line = /^\S+ restored lanes: .*$/mu.exec(world.world.log().slice(from))?.[0] ?? '';
        assert.match(line, /^\S+ restored lanes: the persisted lanes could not be read \(\w+\)$/u);
        assert.ok(!line.includes('w1:'));
        assert.ok(world.world.alive(alive));
    });
});

describe('a column that herdr cannot open is given up, and showing the tab again forgets it', () => {
    let world: ColumnsWorld;

    const tab: TabSpec = { tab: 'w1:t1', area: AREA, panes: [{ id: 'w1:p1', agent: 'claude', rect: AREA }], splits: [] };
    const opens = (): number => world.requests('plugin.pane.open').length;

    before(async () => {
        world = await columnsWorld();
        const refusal = { error: { code: 'unavailable', message: 'herdr cannot open it now' } };
        world.world.herdr.replySequence(Method.PluginPaneOpen, [refusal, refusal, refusal, { result: paneOpened('w1:p30') as never }]);
        world.show(tab);
        await world.started();
        await world.world.awaitLog(/tab w1:t1: column closed 3x — left closed for a while/u);
    });

    after(async () => {
        await world.close();
    });

    test('three refusals in a row make the daemon leave the tab without a column, and it says so', { timeout: 30_000 }, async () => {
        assert.equal(opens(), 3);
        await world.quiet();
        assert.equal(opens(), 3);
    });

    test('hiding the tab and showing it again opens the column at once', { timeout: 30_000 }, async () => {
        const first = await world.world.command('column');
        assert.equal(first.code, 0, first.stderr);
        await world.quiet();
        assert.equal(opens(), 3);
        const second = await world.world.command('column');
        assert.equal(second.code, 0, second.stderr);
        await world.awaitRequest('plugin.pane.open', 4);
        await world.world.awaitLog(/tab w1:t1: column opened \(w1:p30, side\)/u);
    });
});

describe('recaps keep being written while the column is hidden', () => {
    let world: RecapDaemonWorld;

    before(async () => {
        world = await recapDaemonWorld({ TAB_RECAP_RUN_PACING: 'turn', TAB_RECAP_COMPACT_NOTE: 'skip' });
        world.model.answer('default', JSON.stringify({ ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop')] }));
        world.grow(1);
        world.announce(['w1:p1']);
        await world.start();
        const ran = await world.world.command('column');
        assert.equal(ran.code, 0, ran.stderr);
        await world.until(() => (world.rows('SELECT tab_id FROM tab_visibility').length > 0 ? true : undefined), 'the hidden state is saved');
    });

    after(async () => {
        await world.close();
    });

    test('the tab is saved as hidden', { timeout: 30_000 }, () => {
        assert.deepEqual(world.rows('SELECT tab_id FROM tab_visibility').map((row) => row['tab_id']), ['w1:t1']);
    });

    test('a turn that ends is recapped all the same', { timeout: 30_000 }, async () => {
        world.turn();
        const runs = await world.until(() => { const found = world.rows('SELECT cause, error FROM run'); return found.length > 0 ? found : undefined; }, 'the recap of the hidden tab');
        await nap(500);
        assert.deepEqual(runs.map((row) => [row['cause'], row['error']]), [['turn-ended', null]]);
        assert.equal(world.model.calls().length, 1);
    });
});
