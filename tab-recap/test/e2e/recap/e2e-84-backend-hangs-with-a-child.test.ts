import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../support/engine-world.ts';
import { recapDaemonWorld, type RecapDaemonWorld } from '../support/recap-daemon-world.ts';

let world: RecapDaemonWorld;
let pids: { readonly script: number; readonly child: number } | null = null;

const alive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const runs = (): readonly Record<string, unknown>[] => world.rows('SELECT cause, error FROM run ORDER BY at');

before(async () => {
    world = await recapDaemonWorld({ TAB_RECAP_RUN_PACING: 'turn', TAB_RECAP_TIMEOUT_MS: '2000' });
    world.model.answer(1, JSON.stringify({ ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop')] }));
    world.model.answer('default', '!hang');
    world.announce();
    world.grow(1);
    await world.start();
});

after(async () => {
    const started = world.model.pids();
    for (const pid of started === null ? [] : [started.script, started.child]) {
        if (alive(pid)) {
            process.kill(pid, 'SIGKILL');
        }
    }
    await world.close();
});

test('a first turn is recapped by the backend command', { timeout: 30_000 }, async () => {
    world.turn();
    await world.until(() => (runs().length === 1 ? true : undefined), 'the first run');
    assert.deepEqual(runs().map((run) => [run.cause, run.error]), [['turn-ended', null]]);
    assert.deepEqual(world.rows('SELECT text FROM fact').map((row) => row['text']), ['Add a cart to the shop']);
});

test('the next turn starts a command that hangs and has a child process', { timeout: 30_000 }, async () => {
    world.turn();
    pids = await world.until(() => world.model.pids() ?? undefined, 'the hanging command started its child');
    assert.notEqual(pids.script, pids.child);
    assert.equal(alive(pids.script), true);
    assert.equal(alive(pids.child), true);
});

test('the whole process group is killed, the command and its child', { timeout: 30_000 }, async () => {
    assert.ok(pids !== null);
    const gone = pids;
    await world.until(() => (!alive(gone.script) && !alive(gone.child) ? true : undefined), 'both processes are gone', { within: 20_000 });
    assert.equal(alive(gone.script), false);
    assert.equal(alive(gone.child), false);
});

test('the run ends as a timeout and the previous recap stays', { timeout: 30_000 }, async () => {
    await world.until(() => (runs().length === 2 ? true : undefined), 'the second run ended');
    assert.equal(runs().at(-1)?.cause, 'turn-ended');
    assert.match(String(runs().at(-1)?.error), /timeout|timed out/);
    assert.deepEqual(world.rows('SELECT text, state FROM fact').map((row) => [row['text'], row['state']]), [['Add a cart to the shop', 'open']]);
    assert.equal(world.model.calls().length, 2, 'the hang was not retried');
});
