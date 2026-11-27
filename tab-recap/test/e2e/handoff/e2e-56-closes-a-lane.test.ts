import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Directory } from '@stateforge-labs/session-ledger';
import { databaseFile, openStoreAt } from '#src/adapters/db/database.ts';
import { forgetClosedTabs } from '#src/daemon/retention.ts';
import { scratch, type Fixture } from '#test/fixtures/git-repo.ts';
import { closedDaysOf } from '#test/fakes/closed-days.ts';
import { add } from '../support/engine-world.ts';
import { recapDaemonWorld, type RecapDaemonWorld } from '../support/recap-daemon-world.ts';

const EVENT = 'tab-recap-event';
const FIRST = JSON.stringify({ ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop')] });
const SECRET = 'a secret the disk wrote';
const EVENTS_ON = 'TAB_RECAP_HERDR_EVENTS=on';

interface Told {
    readonly target: string;
    readonly value: string;
}

const told = (world: RecapDaemonWorld): readonly Told[] => world.world.herdr.requests().flatMap((request) => {
    const params = request.params as { readonly workspace_id?: string; readonly tokens?: Readonly<Record<string, string | null>>; readonly source?: string };
    const value = params.tokens?.[EVENT];
    return request.method === 'workspace.report_metadata' && params.source === 'tab-recap' && typeof value === 'string' ? [{ target: params.workspace_id ?? '', value }] : [];
});

const closuresTold = (world: RecapDaemonWorld, pane: string): readonly Told[] => {
    return told(world).filter((each) => each.value.endsWith(`:lane-closed:${pane}`));
};

const settings = (world: RecapDaemonWorld, ...lines: readonly string[]): void => {
    writeFileSync(join(world.world.configDir, 'config.env'), `${lines.join('\n')}\n`);
};

const closedRows = (world: RecapDaemonWorld, pane: string): readonly Record<string, unknown>[] =>
    world.rows(`SELECT tab_id, pane, closed_at, agent, cwd, task_id, task_name FROM closed_lane_readable WHERE pane = '${pane}' ORDER BY closed_at`);

const recaps = (world: RecapDaemonWorld): number => world.world.log().split('\n').filter((line) => line.includes('recap w1:t1: written')).length;

describe('a lane closes', () => {
    let world: RecapDaemonWorld;
    let alive = ['w1:p1', 'w1:p2', 'w1:p3', 'w1:p4', 'w1:p5', 'w1:p6', 'w1:p7'];
    let closedBefore = 0;

    const closureOf = (pane: string): Promise<Record<string, unknown>> => world.until(() => closedRows(world, pane)[0], `the closure row of ${pane}`);

    const closing = (pane: string): void => {
        alive = alive.filter((each) => each !== pane);
        world.announce(alive);
        world.world.herdr.push({ event: 'pane_closed', data: { type: 'pane_closed', pane_id: pane } });
    };

    before(async () => {
        world = await recapDaemonWorld();
        settings(world, EVENTS_ON, 'TAB_RECAP_COMPACT_NOTE=skip');
        world.model.answer(1, FIRST);
        world.model.answer('default', JSON.stringify({ ops: [] }));
        world.world.herdr.reply('workspace.report_metadata' as never, { type: 'ok' } as never);
        world.world.herdr.reply('pane.report_metadata' as never, { type: 'ok' } as never);
        world.world.herdr.reply('workspace.list' as never, { type: 'workspace_list', workspaces: [{ workspace_id: 'w1' }] } as never);
        world.typing();
        world.announce(alive);
        world.grow(1);
        await world.start();
    });

    after(async () => {
        await world.close();
    });

    test('a lane closing writes the pending recap of its tab at once, though the quiet time has not passed', { timeout: 30_000 }, async () => {
        const had = recaps(world);
        world.turn();
        closing('w1:p2');
        await world.until(() => (recaps(world) > had ? true : undefined), 'the recap written at the close');
        const row = await closureOf('w1:p2');
        assert.equal(row['task_id'], null);
    });

    test('the closure is recorded with the lane, its agent, its folder and the task it was on', { timeout: 30_000 }, async () => {
        closedBefore = Date.now();
        closing('w1:p1');
        const row = await closureOf('w1:p1');
        assert.equal(row['tab_id'], 'w1:t1');
        assert.equal(row['agent'], 'claude');
        assert.equal(row['cwd'], '/work');
        assert.equal(typeof row['task_id'], 'string');
        assert.ok(Number(row['closed_at']) >= closedBefore && Number(row['closed_at']) <= Date.now());
    });

    test('the closure is announced on the workspace of the tab', { timeout: 30_000 }, async () => {
        const found = await world.until(() => closuresTold(world, 'w1:p1')[0], 'the closure told');
        assert.equal(found.target, 'w1');
        assert.match(found.value, /^[0-9a-z]+:lane-closed:w1:p1$/u);
    });

    test('with events off the closure is recorded and not announced; with events on again each closure was announced exactly once', { timeout: 30_000 }, async () => {
        settings(world, 'TAB_RECAP_HERDR_EVENTS=off', 'TAB_RECAP_COMPACT_NOTE=skip');
        closing('w1:p3');
        await world.until(() => (closedRows(world, 'w1:p3').length > 0 ? true : undefined), 'the closure row of the third lane');
        closing('w1:p7');
        await world.until(() => (closedRows(world, 'w1:p7').length > 0 ? true : undefined), 'the closure row of the seventh lane');
        settings(world, EVENTS_ON, 'TAB_RECAP_COMPACT_NOTE=skip');
        closing('w1:p4');
        await world.until(() => closuresTold(world, 'w1:p4')[0], 'the fourth closure told');
        assert.deepEqual([closuresTold(world, 'w1:p3'), closuresTold(world, 'w1:p7')], [[], []]);
        for (const pane of ['w1:p1', 'w1:p2', 'w1:p4']) {
            assert.equal(closuresTold(world, pane).length, 1, pane);
        }
    });

    test('a lane that was gone while the daemon was down is recorded and announced when it starts again, from the lanes it persisted', { timeout: 30_000 }, async () => {
        await world.world.stop();
        const resumed = world.world.log().length;
        const stopped = Date.now();
        alive = ['w1:p6'];
        world.announce(alive);
        world.world.daemon();
        await world.world.awaitLog(/daemon \d+ up, state in /u, { after: resumed });
        const row = await closureOf('w1:p5');
        assert.equal(row['agent'], 'claude');
        assert.ok(Number(row['closed_at']) >= stopped);
        const found = await world.until(() => closuresTold(world, 'w1:p5')[0], 'the restart closure told');
        assert.equal(found.target, 'w1');
        assert.equal(closuresTold(world, 'w1:p5').length, 1);
    });

    test('a store that refuses the closure is logged without its text, and the lane is still announced', { timeout: 30_000 }, async () => {
        const db = new Database(join(world.world.stateDir, 'tab-recap.db'));
        db.exec('PRAGMA busy_timeout = 5000');
        db.exec(`CREATE TRIGGER refuse_closures BEFORE INSERT ON closed_lane BEGIN SELECT RAISE(ABORT, '${SECRET}'); END`);
        try {
            closing('w1:p6');
            await world.until(() => closuresTold(world, 'w1:p6')[0], 'the sixth closure told');
            const line = await world.world.awaitLog(/lane w1:p6: closure not recorded \(\w+\)/u);
            assert.ok(!line.line.includes(SECRET));
            assert.ok(!world.world.log().includes(SECRET));
            assert.deepEqual(closedRows(world, 'w1:p6'), []);
        } finally {
            db.exec('DROP TRIGGER refuse_closures');
            db.close();
        }
    });
});

describe('a lane closes while the closure window is 0', () => {
    let world: RecapDaemonWorld;
    let alive = ['w1:p1', 'w1:p2'];

    before(async () => {
        world = await recapDaemonWorld();
        settings(world, EVENTS_ON, 'TAB_RECAP_COMPACT_NOTE=skip', 'TAB_RECAP_CLOSED_LANE_DAYS=0');
        world.model.answer('default', FIRST);
        world.world.herdr.reply('workspace.report_metadata' as never, { type: 'ok' } as never);
        world.world.herdr.reply('pane.report_metadata' as never, { type: 'ok' } as never);
        world.world.herdr.reply('workspace.list' as never, { type: 'workspace_list', workspaces: [{ workspace_id: 'w1' }] } as never);
        world.typing();
        world.announce(alive);
        world.grow(1);
        await world.start();
    });

    after(async () => {
        await world.close();
    });

    test('the closure is announced all the same, the pending recap of the tab is written, and no closure is recorded', { timeout: 30_000 }, async () => {
        const had = recaps(world);
        world.turn();
        alive = ['w1:p1'];
        world.announce(alive);
        world.world.herdr.push({ event: 'pane_closed', data: { type: 'pane_closed', pane_id: 'w1:p2' } });
        const found = await world.until(() => closuresTold(world, 'w1:p2')[0], 'the closure told');
        assert.equal(found.target, 'w1');
        await world.until(() => (recaps(world) > had ? true : undefined), 'the recap written at the close');
        assert.deepEqual(closedRows(world, 'w1:p2'), []);
    });
});

const DAY = 86_400_000;

describe('closures are forgotten after the closure window, and a tab they protect is kept', () => {
    const KEYS = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_KEEP_DAYS'] as const;
    const saved = new Map<string, string | undefined>();
    let fixture: Fixture;
    let state: string;
    let now = 0;

    const sweep = (days: string): readonly string[] => {
        const lines: string[] = [];
        const opened = openStoreAt(databaseFile(state as Directory), { closedDays: closedDaysOf(days) });
        if (opened.kind !== 'ready') {
            assert.fail('the store opens');
        }
        try {
            forgetClosedTabs(opened, (line) => { lines.push(String(line)); });
        } finally {
            opened.close();
        }
        return lines;
    };

    const read = (statement: string): readonly string[] => {
        const opened = openStoreAt(databaseFile(state as Directory));
        if (opened.kind !== 'ready') {
            assert.fail('the store opens');
        }
        try {
            return opened.db.prepare(statement).all().map((row) => Object.values(row as Record<string, unknown>).join(' '));
        } finally {
            opened.close();
        }
    };

    const closures = (): readonly string[] => read('SELECT tab_id, pane FROM closed_lane ORDER BY tab_id, pane');
    const tabs = (): readonly string[] => read('SELECT id FROM tab ORDER BY id');

    before(() => {
        for (const key of KEYS) {
            saved.set(key, process.env[key]);
        }
        fixture = scratch('tab-recap-closure-retention-');
        state = join(fixture.root, 'state');
        mkdirSync(state, { recursive: true });
        mkdirSync(join(fixture.root, 'config'), { recursive: true });
        writeFileSync(join(fixture.root, 'config', 'config.env'), '');
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = join(fixture.root, 'config');
        process.env['TAB_RECAP_KEEP_DAYS'] = '30';
        now = Date.now();
        const opened = openStoreAt(databaseFile(state as Directory));
        if (opened.kind !== 'ready') {
            assert.fail('the store opens');
        }
        const tab = opened.db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, ?, ?)');
        const closed = opened.db.prepare("INSERT INTO closed_lane (tab_id, pane, closed_at, agent) VALUES (?, ?, ?, 'claude')");
        for (const [id, seen] of [['w6:t1', 40], ['w7:t1', 0], ['w8:t1', 40], ['w9:t1', 40]] as const) {
            tab.run(id, now - seen * DAY - 1, now - seen * DAY);
        }
        for (const [id, pane, ago] of [['w6:t1', 'w6:p1', 20], ['w7:t1', 'w7:p1', 20], ['w7:t1', 'w7:p2', 10], ['w8:t1', 'w8:p1', 2]] as const) {
            closed.run(id, pane, now - ago * DAY);
        }
        opened.close();
    });

    after(() => {
        fixture.clean();
        for (const [key, value] of saved) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    test('with a window of 14 days a closure 20 days old is forgotten and one 10 days old stays', { timeout: 30_000 }, () => {
        sweep('14');
        assert.deepEqual(closures().filter((each) => each.startsWith('w7:t1')), ['w7:t1 w7:p2']);
    });

    test('a tab last seen long ago is kept while a closure inside the window protects it; a tab with none, or only an expired one, is removed', { timeout: 30_000 }, () => {
        assert.deepEqual(tabs(), ['w7:t1', 'w8:t1']);
        assert.deepEqual(closures(), ['w7:t1 w7:p2', 'w8:t1 w8:p1']);
    });

    test('with the window shortened to 7 days the 10-day closure goes, and the 2-day closure stays and still protects its tab', { timeout: 30_000 }, () => {
        sweep('7');
        assert.deepEqual(closures(), ['w8:t1 w8:p1']);
        assert.deepEqual(tabs(), ['w7:t1', 'w8:t1']);
    });

    test('with a window of 0 nothing protects a tab: it is removed with its closures, and the log counts them', { timeout: 30_000 }, () => {
        const lines = sweep('0');
        assert.deepEqual(closures(), []);
        assert.deepEqual(tabs(), ['w7:t1']);
        assert.equal(lines.filter((line) => /^retention: removed w8:t1 \(.* 1 closures\)$/u.test(line)).length, 1);
    });
});
