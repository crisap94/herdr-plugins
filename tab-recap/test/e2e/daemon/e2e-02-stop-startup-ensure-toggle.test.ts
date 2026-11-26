import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { daemonWorld, type DaemonWorld, type Ran } from '../support/daemon-world.ts';

const OPENING = new Set(['pane.split', 'plugin.pane.open']);
const CLOSING = new Set(['pane.close', 'plugin.pane.close']);

let world: DaemonWorld;
let running: number;
let stopped: Ran;

const countOf = (names: ReadonlySet<string>): number => world.herdr.receivedMethods().filter((method) => names.has(method)).length;

before(async () => {
    world = await daemonWorld();
    const started = await world.command('start');
    running = Number(/pid (\d+)/.exec(started.stdout)?.[1]);
    await world.awaitLog(/daemon \d+ up, state in \S+/);
});

after(async () => {
    await world.close();
});

test('stop says the daemon closes its columns and exits', { timeout: 30_000 }, async () => {
    stopped = await world.stop();
    assert.equal(stopped.code, 0, stopped.stderr);
    assert.equal(stopped.stdout.trim(), `tab-recap: off — daemon ${running} closes its columns and exits`);
});

test('stop on an empty session opens no column and closes none', { timeout: 30_000 }, async () => {
    await world.awaitLog(/stopping: closed 0 columns/);
    assert.equal(countOf(OPENING), 0);
    assert.equal(countOf(CLOSING), 0);
});

test('the daemon process is gone after stop', { timeout: 30_000 }, async () => {
    await world.awaitGone(running);
    assert.equal(world.alive(running), false);
    assert.equal(world.pidfile().pid, null);
});

test('the off flag is set after stop', () => {
    assert.equal(world.pidfile().disabled, true);
});

test('startup leaves the daemon off', { timeout: 30_000 }, async () => {
    const ran = await world.command('startup');
    assert.equal(ran.code, 0, ran.stderr);
    assert.equal(ran.stdout, '');
    assert.equal(world.pidfile().pid, null);
    assert.equal(world.pidfile().disabled, true);
});

test('ensure leaves the daemon off', { timeout: 30_000 }, async () => {
    const ran = await world.command('ensure');
    assert.equal(ran.code, 0, ran.stderr);
    assert.equal(ran.stdout, '');
    assert.equal(world.pidfile().pid, null);
    assert.equal(world.pidfile().disabled, true);
});

test('toggle starts a daemon and clears the off flag', { timeout: 30_000 }, async () => {
    const ran = await world.command('toggle');
    assert.equal(ran.code, 0, ran.stderr);
    const named = Number(/pid (\d+)/.exec(ran.stdout)?.[1]);
    assert.match(ran.stdout, /daemon started/);
    assert.notEqual(named, running);
    await world.awaitLog(new RegExp(`daemon ${named} up, state in `));
    assert.equal(world.pidfile().pid, named);
    assert.equal(world.pidfile().disabled, false);
    assert.equal(world.alive(named), true);
});
