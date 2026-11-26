import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { daemonWorld, type DaemonWorld, type Ran } from '../support/daemon-world.ts';

let world: DaemonWorld;
let first: Ran;
let upAt = 0;
const SETTLE_MS = 1500;

before(async () => {
    world = await daemonWorld();
});

after(async () => {
    await world.close();
});

test('start runs one daemon and says it started', { timeout: 30_000 }, async () => {
    first = await world.command('start');
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /tab-recap: daemon started \(pid \d+\)/);
    const pid = Number(/pid (\d+)/.exec(first.stdout)?.[1]);
    assert.ok(world.alive(pid), 'the daemon named by start is running');
});

test('the daemon logs it is up with its pid and the scratch state', { timeout: 30_000 }, async () => {
    const named = Number(/pid (\d+)/.exec(first.stdout)?.[1]);
    const up = await world.awaitLog(/daemon \d+ up, state in \S+/);
    upAt = up.cursor;
    assert.equal(up.line, `daemon ${named} up, state in ${world.stateDir}`);
});

test('a second start says the daemon is already running and starts none', { timeout: 30_000 }, async () => {
    const running = world.pidfile().pid;
    assert.notEqual(running, null);
    const again = await world.command('start');
    assert.equal(again.code, 0, again.stderr);
    assert.equal(again.stdout.trim(), `tab-recap: daemon already running (pid ${running})`);
    assert.equal(world.pidfile().pid, running);
    await new Promise((settled) => { setTimeout(settled, SETTLE_MS); });
    const since = world.log().slice(upAt);
    assert.doesNotMatch(since, / up, state in /, 'no second daemon came up');
    assert.doesNotMatch(since, /another daemon is running/, 'no second daemon was launched');
});

test('status names the running pid and its version', { timeout: 30_000 }, async () => {
    const running = world.pidfile().pid;
    const status = await world.command('status');
    assert.equal(status.code, 0, status.stderr);
    const daemonLine = status.stdout.split('\n').find((line) => line.includes(String(running)));
    assert.ok(daemonLine, `a status line names pid ${running}: ${status.stdout}`);
    const version = world.pidfile().version;
    assert.notEqual(version, null);
    assert.ok(daemonLine.includes(String(version)), daemonLine);
});
