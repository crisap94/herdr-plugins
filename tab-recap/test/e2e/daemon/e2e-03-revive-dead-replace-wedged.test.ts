import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { daemonWorld, type DaemonWorld } from '../support/daemon-world.ts';

const TEN_MINUTES = 10 * 60_000;

let world: DaemonWorld;
let first: number;
let second: number;
let replacement = '';

const pidOf = (stdout: string): number => Number(/daemon started \(pid (\d+)\)/.exec(stdout)?.[1]);

before(async () => {
    world = await daemonWorld();
    const started = await world.command('start');
    first = pidOf(started.stdout);
    await world.awaitLog(new RegExp(`daemon ${first} up, state in `));
});

after(async () => {
    await world.close();
});

test('ensure leaves a running daemon alone', { timeout: 30_000 }, async () => {
    const ran = await world.command('ensure');
    assert.equal(ran.code, 0, ran.stderr);
    assert.equal(ran.stdout, '');
    assert.equal(world.pidfile().pid, first);
    assert.equal(world.alive(first), true);
});

test('ensure starts a new daemon when the old one was killed', { timeout: 30_000 }, async () => {
    process.kill(first, 'SIGKILL');
    await world.awaitGone(first);
    assert.equal(world.pidfile().pid, first);
    const ran = await world.command('ensure');
    assert.equal(ran.code, 0, ran.stderr);
    second = pidOf(ran.stdout);
    assert.ok(second > 0 && second !== first, ran.stdout);
    await world.awaitLog(new RegExp(`daemon ${second} up, state in `));
    assert.equal(world.pidfile().pid, second);
    assert.equal(world.alive(second), true);
});

test('start kills a daemon whose beat went stale and says so', { timeout: 30_000 }, async () => {
    process.kill(second, 'SIGSTOP');
    const old = new Date(Date.now() - TEN_MINUTES);
    utimesSync(join(world.stateDir, 'daemon.beat'), old, old);
    assert.ok(Date.now() - statSync(join(world.stateDir, 'daemon.beat')).mtimeMs > TEN_MINUTES / 2);
    const ran = await world.command('start');
    replacement = ran.stdout;
    assert.equal(ran.code, 0, ran.stderr);
    assert.match(ran.stdout, new RegExp(`daemon ${second} was stuck \\(no beat for 3 minutes\\): stopped it, starting a new one`));
    await world.awaitGone(second);
    assert.equal(world.alive(second), false);
});

test('the replacement is a new daemon that owns the pidfile', { timeout: 30_000 }, async () => {
    const third = pidOf(replacement);
    assert.ok(third > 0 && third !== second && third !== first, replacement);
    await world.awaitLog(new RegExp(`daemon ${third} up, state in `));
    assert.equal(world.pidfile().pid, third);
    assert.equal(world.alive(third), true);
});
