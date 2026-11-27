import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recapDaemonWorld, type RecapDaemonWorld } from '../support/recap-daemon-world.ts';

const PLUGIN_VERSION = /^version\s*=\s*"(\d+\.\d+\.\d+)"/mu.exec(readFileSync(join(import.meta.dirname, '..', '..', '..', 'herdr-plugin.toml'), 'utf8'))?.[1] ?? '';
const OLD = '0.0.1';

describe('the code is upgraded while the daemon keeps running', () => {
    let world: RecapDaemonWorld;
    let pid = 0;

    const views = (): readonly Record<string, unknown>[] => world.rows('SELECT daemon_version FROM tab WHERE id = \'w1:t1\'');
    const lanes = (): readonly (readonly [unknown, unknown, unknown])[] => world.rows('SELECT pane, position, cwd FROM lane WHERE tab_id = \'w1:t1\' ORDER BY position').map((row) => [row['pane'], row['position'], row['cwd']] as const);
    const daemonLine = async (): Promise<string> => {
        const status = await world.world.command('status');
        assert.equal(status.code, 0, status.stderr);
        return status.stdout.split('\n').find((line) => line.startsWith('daemon ')) ?? '';
    };
    const versionLine = async (): Promise<string> => (await world.world.command('status')).stdout.split('\n').find((line) => line.startsWith('version')) ?? '';

    before(async () => {
        world = await recapDaemonWorld();
        world.announce(['w1:p1', 'w1:p2']);
        await world.start();
        await world.until(() => (lanes().length === 2 && views().length === 1 && world.rows('SELECT 1 FROM lane WHERE pane = \'w1:p2\' AND last_prompt IS NOT NULL').length === 1 ? true : undefined), 'the daemon writes the tab view');
        pid = Number(world.world.pidfile().pid);
    });

    after(async () => {
        await world.close();
    });

    test('the plugin on disk names a version', { timeout: 30_000 }, () => {
        assert.match(PLUGIN_VERSION, /^\d+\.\d+\.\d+$/);
    });

    test('the daemon stamps its own version on the view it writes, with the lanes in order and their directory', { timeout: 30_000 }, () => {
        assert.deepEqual(views(), [{ daemon_version: PLUGIN_VERSION }]);
        assert.equal(world.world.pidfile().version, PLUGIN_VERSION);
        assert.deepEqual(lanes(), [['w1:p1', 0, '/work'], ['w1:p2', 1, '/work']]);
        assert.deepEqual(world.rows('SELECT pane, last_prompt FROM lane WHERE tab_id = \'w1:t1\' ORDER BY position').map((row) => [row['pane'], row['last_prompt']]), [['w1:p1', null], ['w1:p2', 'Review the cart tests in test/cart.test.ts']]);
    });

    test('while code and daemon agree, status gives the same version twice', { timeout: 30_000 }, async () => {
        assert.equal(await versionLine(), `version  ${PLUGIN_VERSION}`);
        assert.equal(await daemonLine(), `daemon   pid ${pid} v${PLUGIN_VERSION}`);
    });

    test('after the upgrade status names the new code version and the old daemon version', { timeout: 30_000 }, async () => {
        writeFileSync(join(world.world.stateDir, 'daemon.version'), `${OLD}\n`);
        assert.equal(await versionLine(), `version  ${PLUGIN_VERSION}`);
        assert.equal(await daemonLine(), `daemon   pid ${pid} v${OLD}`);
    });

    test('a handoff is refused daemon-outdated, with the reason and a failing exit', { timeout: 30_000 }, async () => {
        const ran = await world.world.command('handoff', '--from', 'w1:p1', '--to', 'w1:p2');
        assert.equal(ran.code, 1, ran.stdout + ran.stderr);
        assert.match(ran.stderr, /the running daemon is another version: restart it, then try again/);
        assert.equal(ran.stdout, '');
        assert.deepEqual(world.rows("SELECT id FROM request WHERE kind = 'handoff'"), []);
    });

    test('the column names the old daemon and asks for a restart, in the interface language', { timeout: 30_000 }, async () => {
        const column = world.column(100, 40);
        await column.painted((screen) => screen.text.includes('TAB RECAP') || screen.text.includes('No recap yet'), 'the column paints');
        assert.doesNotMatch(column.screen()?.text ?? '', /daemon v/);
        const db = new Database(join(world.world.stateDir, 'tab-recap.db'));
        try {
            db.prepare('UPDATE tab SET daemon_version = ? WHERE id = ?').run(OLD, 'w1:t1');
        } finally {
            db.close();
        }
        await column.painted((screen) => screen.text.includes(`daemon v${OLD} — restart`), 'the column names the old daemon');
    });

    test('a restart brings the daemon to the new version: the view is rewritten with the lanes as they are now, and the column loses the line', { timeout: 30_000 }, async () => {
        const column = world.column(100, 40);
        await column.painted((screen) => screen.text.includes(`daemon v${OLD} — restart`), 'the column still names the old daemon');
        await world.world.stop();
        world.announce(['w1:p1', 'w1:p3']);
        const started = await world.world.command('start');
        assert.equal(started.code, 0, started.stderr);
        await world.until(() => (lanes().some((lane) => lane[0] === 'w1:p3') ? true : undefined), 'the new daemon writes the new lanes');
        assert.deepEqual(lanes().map((lane) => [lane[0], lane[1]]), [['w1:p1', 0], ['w1:p3', 1]]);
        assert.deepEqual(views(), [{ daemon_version: PLUGIN_VERSION }]);
        assert.equal(await daemonLine(), `daemon   pid ${Number(world.world.pidfile().pid)} v${PLUGIN_VERSION}`);
        await column.painted((screen) => !screen.text.includes('daemon v'), 'the column no longer names a stale daemon');
        await column.close();
    });
});
