import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { daemonWorld, type Child, type DaemonWorld } from '../support/daemon-world.ts';

let world: DaemonWorld;
let first: Child;
let second: Child;
let secondExit: number;
let upAt = 0;

before(async () => {
    world = await daemonWorld();
});

after(async () => {
    await world.close();
});

test('the first daemon is up and owns the pidfile', { timeout: 30_000 }, async () => {
    first = world.daemon();
    const up = await world.awaitLog(new RegExp(`daemon ${first.pid} up, state in `));
    upAt = up.cursor;
    assert.equal(world.pidfile().pid, first.pid);
});

test('a second daemon on the same state logs another daemon is running', { timeout: 30_000 }, async () => {
    second = world.daemon();
    assert.notEqual(second.pid, first.pid);
    const line = await world.awaitLog(/another daemon is running \(pid \d+\)/, { after: upAt });
    assert.equal(line.line, `another daemon is running (pid ${first.pid})`);
});

test('the second daemon exits with code 0', { timeout: 30_000 }, async () => {
    secondExit = await second.exited;
    assert.equal(secondExit, 0);
    assert.equal(world.alive(second.pid), false);
});

test('the first daemon keeps its pidfile and keeps running', () => {
    assert.equal(world.pidfile().pid, first.pid);
    assert.equal(world.alive(first.pid), true);
    assert.equal(world.log().includes(`daemon ${second.pid} up`), false);
});
