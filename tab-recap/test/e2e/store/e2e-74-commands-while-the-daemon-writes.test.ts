import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { add } from '../support/engine-world.ts';
import { recapDaemonWorld, type RecapDaemonWorld } from '../support/recap-daemon-world.ts';
import type { Ran } from '../support/daemon-world.ts';

const BIN = join(import.meta.dirname, '..', '..', '..', 'bin', 'tab-recap.mjs');
const PLUGIN = join(import.meta.dirname, '..', '..', '..');
const TABS = Array.from({ length: 12 }, (_, at) => `w1:t${at + 2}`);
const FIRST = JSON.stringify({ ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop')] });
const LOCKED = /database is locked|SQLITE_BUSY/iu;

describe('commands run while the daemon writes', () => {
    let world: RecapDaemonWorld;
    let ran: readonly Ran[] = [];
    let status: readonly Ran[] = [];

    const asTab = (tab: string, ...args: readonly string[]): Promise<Ran> => new Promise((resolve) => {
        const env = { ...world.world.env, HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ tab_id: tab, pane_id: `${tab}.p` }) };
        const child = spawn(process.execPath, [BIN, ...args], { cwd: PLUGIN, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        const timer = setTimeout(() => { child.kill('SIGKILL'); }, 20_000);
        child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    });

    before(async () => {
        world = await recapDaemonWorld({ TAB_RECAP_RUN_PACING: 'turn', TAB_RECAP_COMPACT_NOTE: 'skip' });
        world.model.answer(1, FIRST);
        world.model.answer('default', JSON.stringify({ ops: [] }));
        world.typing();
        world.announce(['w1:p1']);
        world.grow(1);
        await world.start();
    });

    after(async () => {
        await world.close();
    });

    test('the daemon records the first turn and keeps the store in WAL mode', { timeout: 30_000 }, async () => {
        world.turn();
        await world.until(() => (world.rows('SELECT id FROM run').length === 1 ? true : undefined), 'the first run');
        assert.deepEqual(world.rows('PRAGMA journal_mode').map((row) => row['journal_mode']), ['wal']);
    });

    test('twelve tabs ask for their column while the daemon keeps writing runs: every command exits 0 and says what it did', { timeout: 30_000 }, async () => {
        const asking = TABS.map((tab) => asTab(tab, 'column'));
        const reading = TABS.map((tab) => asTab(tab, 'status'));
        for (let turn = 0; turn < 3; turn += 1) {
            world.grow(1);
            world.turn();
        }
        ran = await Promise.all(asking);
        status = await Promise.all(reading);
        assert.deepEqual(ran.map((each) => each.code), TABS.map(() => 0), ran.map((each) => each.stderr).join('\n'));
        assert.ok(ran.every((each) => each.stdout.trim() !== ''), ran.map((each) => each.stdout).join('|'));
        assert.deepEqual(status.map((each) => each.code), TABS.map(() => 0), status.map((each) => each.stderr).join('\n'));
    });

    test('no command printed "database is locked" or a busy error, on stdout or stderr', { timeout: 30_000 }, () => {
        for (const each of [...ran, ...status]) {
            assert.doesNotMatch(each.stdout, LOCKED);
            assert.doesNotMatch(each.stderr, LOCKED);
        }
    });

    test('no write is lost: every tab that asked is hidden in the store and the queue is empty', { timeout: 30_000 }, async () => {
        await world.until(() => (world.rows('SELECT kind FROM request').length === 0 && world.rows('SELECT tab_id FROM tab_visibility').length === TABS.length ? true : undefined), 'every ask taken and written');
        assert.deepEqual(world.rows("SELECT tab_id FROM tab_visibility WHERE state = 'hidden'").map((row) => String(row['tab_id'])).toSorted(), TABS.toSorted());
    });

    test('the daemon\'s own writes landed too: the turns it was recording are runs, and it logged no lock', { timeout: 30_000 }, async () => {
        await world.until(() => (world.rows('SELECT id FROM run').length >= 2 ? true : undefined), 'a run after the first');
        assert.doesNotMatch(world.world.log(), LOCKED);
        assert.equal(world.world.alive(world.world.pidfile().pid ?? -1), true);
    });
});
