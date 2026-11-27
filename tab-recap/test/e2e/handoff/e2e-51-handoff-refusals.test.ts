import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Directory } from '@stateforge-labs/session-ledger';
import { databaseFile, openStoreAt } from '#src/adapters/db/database.ts';
import { codeVersion } from '#src/adapters/os/plugin-version.ts';
import { daemonWorld, type DaemonWorld, type Ran } from '../support/daemon-world.ts';
import { handoffWorld, SOURCE, TARGET, type HandoffWorld } from '../support/handoff-world.ts';

const refusal = (text: string): string => `tab-recap: 1 — ${text}\n`;
const database = (world: DaemonWorld): boolean => existsSync(join(world.stateDir, 'tab-recap.db'));
const daemonRecorded = (world: DaemonWorld, version: string): void => {
    writeFileSync(join(world.stateDir, 'daemon.pid'), `${process.pid}\n`);
    writeFileSync(join(world.stateDir, 'daemon.version'), `${version}\n`);
};

describe('a handoff the command refuses before a daemon is asked', () => {
    let world: DaemonWorld;

    before(async () => {
        world = await daemonWorld();
    });

    after(async () => {
        await world.close();
    });

    test('a handoff to the same lane is refused on stderr with exit 1 and writes no state', { timeout: 30_000 }, async () => {
        const ran = await world.command('handoff', '--from', 'w1:p1', '--to', 'w1:p1');
        assert.deepEqual([ran.code, ran.stdout, ran.stderr], [1, '', refusal('the source and the target are the same lane')]);
        assert.equal(database(world), false);
    });

    test('with no daemon running it is refused by name, exits 1 and opens no database', { timeout: 30_000 }, async () => {
        const ran = await world.command('handoff', '--from', 'w1:p1', '--to', 'w1:p2');
        assert.deepEqual([ran.code, ran.stdout, ran.stderr], [1, '', refusal('the daemon is not running: nothing was sent')]);
        assert.equal(database(world), false);
    });

    test('a daemon recording another code version is refused by name and writes no row', { timeout: 30_000 }, async () => {
        daemonRecorded(world, '0.0.1');
        const ran = await world.command('handoff', '--from', 'w1:p1', '--to', 'w1:p2');
        assert.deepEqual([ran.code, ran.stdout, ran.stderr], [1, '', refusal('the running daemon is another version: restart it, then try again')]);
        assert.equal(database(world), false);
    });

    test('a source that is a label rather than a lane is refused as unknown and nothing is queued', { timeout: 30_000 }, async () => {
        const owner = openStoreAt(databaseFile(world.stateDir as Directory));
        assert.equal(owner.kind, 'ready');
        owner.close();
        daemonRecorded(world, codeVersion() ?? 'unknown');
        const ran = await world.command('handoff', '--from', 'my agent', '--to', 'w1:p2');
        assert.deepEqual([ran.code, ran.stdout, ran.stderr], [1, '', refusal('tab-recap does not know the source lane')]);
        const store = openStoreAt(databaseFile(world.stateDir as Directory));
        assert.equal(store.kind, 'ready');
        assert.deepEqual(store.requests.takeHandoffs(), []);
        store.close();
    });

    test('bad options exit 2 with the problem named before the usage, and neither a row nor a daemon follows', { timeout: 30_000 }, async () => {
        const closed = ['--from-closed', 'w1:p1', '--tab', 'w1:t1', '--closed-at', '1000'];
        const cases: readonly (readonly [readonly string[], string])[] = [
            [['--from', 'w1:p1', '--to', 'w1:p2', '--to', 'w1:p3'], '--to given more than once'],
            [['--from', 'w1:p1', '--to', '', ], '--to needs a pane id'],
            [['--from', 'w1:p1', ...closed, '--to', 'w1:p2'], '--from and --from-closed are exclusive'],
            [['--from-closed', 'w1:p1', '--to', 'w1:p2'], '--from-closed, --tab and --closed-at go together'],
            [[...closed.slice(0, 4), '--closed-at=-1', '--to', 'w1:p2'], '--closed-at needs a non-negative integer'],
            [[...closed.slice(0, 4), '--closed-at', '1e3', '--to', 'w1:p2'], '--closed-at needs a non-negative integer'],
            [[...closed.slice(0, 4), '--closed-at', '8640000000000001', '--to', 'w1:p2'], '--closed-at needs a non-negative integer'],
            [[...closed.slice(0, 4), '--closed-at', '9007199254740991', '--to', 'w1:p2'], '--closed-at needs a non-negative integer'],
            [[...closed, '--to', 'w1:p2', '--refresh'], '--from-closed does not go with --refresh'],
            [['--from-closed', 'w1:p1', '--from-closed', 'w1:p3', '--tab', 'w1:t1', '--closed-at', '1000', '--to', 'w1:p2'], 'a closed-source option is given more than once'],
            [['--from-closed', 'w1:p1', '--tab', 'w1:t1', '--tab', 'w1:t2', '--closed-at', '1000', '--to', 'w1:p2'], 'a closed-source option is given more than once'],
            [['--from-closed', 'w1:p1', '--tab', 'w1:t1', '--closed-at', '1000', '--closed-at', '2000', '--to', 'w1:p2'], 'a closed-source option is given more than once'],
            [['--list-closed', '--tab', 'w1:t1', '--to', 'w1:p2'], '--list-closed takes only --tab'],
        ];
        const recorded = existsSync(join(world.stateDir, 'daemon.pid'));
        for (const [args, problem] of cases) {
            const ran: Ran = await world.command('handoff', ...args);
            assert.equal(ran.code, 2, args.join(' '));
            assert.equal(ran.stdout, '', args.join(' '));
            assert.ok(ran.stderr.startsWith(`tab-recap: 2 — ${problem}\nUSAGE: tab-recap `), `${args.join(' ')}: ${ran.stderr}`);
        }
        assert.equal(existsSync(join(world.stateDir, 'daemon.pid')), recorded);
    });

    test('the latest instant a date can hold is accepted as the close time, so the only refusal is the missing daemon', { timeout: 30_000 }, async () => {
        rmSync(join(world.stateDir, 'daemon.pid'), { force: true });
        rmSync(join(world.stateDir, 'daemon.version'), { force: true });
        const ran = await world.command('handoff', '--from-closed', 'w1:p1', '--tab', 'w1:t1', '--closed-at', '8640000000000000', '--to', 'w1:p2');
        assert.deepEqual([ran.code, ran.stdout, ran.stderr], [1, '', refusal('the daemon is not running: nothing was sent')]);
    });
});

describe('a handoff the daemon refuses', () => {
    let world: HandoffWorld;

    before(async () => {
        world = await handoffWorld({ answers: [], recapped: false });
    });

    after(async () => {
        await world.close();
    });

    const answers = (): readonly Record<string, unknown>[] => world.recap.rows('SELECT outcome, reason FROM handoff_answer_readable');
    const handoff = (...args: readonly string[]): Promise<Ran> => world.recap.world.command('handoff', ...args);

    test('a lane with no recap run yet is refused as having no recap, exits 1, sends nothing and the answer is stored', { timeout: 30_000 }, async () => {
        const ran = await handoff('--from', SOURCE, '--to', TARGET);
        assert.deepEqual([ran.code, ran.stdout, ran.stderr], [1, '', refusal('the source task has no recap yet: run a recap or use --refresh')]);
        assert.deepEqual(world.prompts(), []);
        assert.deepEqual(answers(), [{ outcome: 'refused', reason: 'ledger-empty' }]);
        assert.deepEqual(world.recap.rows("SELECT id FROM request WHERE kind = 'handoff'"), []);
    });

    test('print of a lane with no recap run is refused the same way and stores nothing', { timeout: 30_000 }, async () => {
        const ran = await handoff('--from', SOURCE, '--print');
        assert.deepEqual([ran.code, ran.stdout, ran.stderr], [1, '', refusal('the source task has no recap yet: run a recap or use --refresh')]);
        assert.equal(answers().length, 1);
    });

    test('print of a source no tab lists is refused as unknown, and print to the same lane is refused as the same lane', { timeout: 30_000 }, async () => {
        const unknown = await handoff('--from', 'w1:p9', '--print');
        assert.deepEqual([unknown.code, unknown.stdout, unknown.stderr], [1, '', refusal('tab-recap does not know the source lane')]);
        const same = await handoff('--from', SOURCE, '--to', SOURCE, '--print');
        assert.deepEqual([same.code, same.stdout, same.stderr], [1, '', refusal('the source and the target are the same lane')]);
        assert.equal(answers().length, 1);
    });
});

describe('a handoff to a lane the daemon does not follow', () => {
    let world: HandoffWorld;

    before(async () => {
        world = await handoffWorld({ answers: [JSON.stringify({ ops: [] })], target: 'gemini' });
    });

    after(async () => {
        await world.close();
    });

    test('is refused because the target is not a lane it can hand work to, exits 1, sends nothing and stores the answer', { timeout: 30_000 }, async () => {
        const ran = await world.recap.world.command('handoff', '--from', SOURCE, '--to', TARGET);
        assert.deepEqual([ran.code, ran.stdout, ran.stderr], [1, '', refusal('the target is not a lane tab-recap can hand work to')]);
        assert.deepEqual(world.prompts(), []);
        assert.deepEqual(world.recap.rows('SELECT outcome, reason FROM handoff_answer_readable'), [{ outcome: 'refused', reason: 'not-a-lane' }]);
    });
});
