import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HerdrActiveInstalls } from '#src/adapters/herdr/active-install.ts';
import { parseVersion, type Line } from '#src/daemon/slots.ts';
import { startRoll, type Activity, type Successor } from '#src/daemon/view/roll.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { JsonObject } from '#src/adapters/herdr/json-object.ts';
import { parseText } from '@stateforge-labs/session-ledger';

const ID = must(parseText('tab-recap'));
const present = (): 'present' => 'present';
const absent = (): 'absent' => 'absent';

const OLD_ROOT = '/plugins/tab-recap-abc/1-0/checkout/tab-recap';
const NEW_ROOT = '/plugins/tab-recap-abc/2-0/checkout/tab-recap';
const OWN_LAUNCHER = must(parseFsPath(`${OLD_ROOT}/bin/tab-recap.mjs`));

const settle = async (): Promise<void> => {
    for (let round = 0; round < 5; round += 1) {
        await new Promise((resolve) => { setImmediate(resolve); });
    }
};

interface Herdr {
    readonly answer: () => Promise<JsonObject>;
}

const listing = (root: string, version: string): Herdr => ({
    answer: () => Promise.resolve({ type: 'plugin_list', plugins: [
        { plugin_id: 'other', plugin_root: '/plugins/other', version: '9.9.9', enabled: true },
        { plugin_id: 'tab-recap', plugin_root: root, version, enabled: true },
    ] }),
});

const unreachable: Herdr = { answer: () => Promise.reject(new Error('no socket')) };

interface Daemon {
    readonly ticks: (count: number) => Promise<void>;
    readonly waiters: FsPath[];
    readonly terminated: () => boolean;
    readonly lines: Line[];
}

function daemon(herdr: Herdr, options: { readonly started: string; readonly localVersion: string; readonly activity?: Activity }): Daemon {
    const waiters: FsPath[] = [];
    const lines: Line[] = [];
    let terminated = false;
    const installs = new HerdrActiveInstalls(herdr.answer, ID, present);
    const running = startRoll({
        started: parseVersion(options.started),
        active: () => installs.active(),
        local: (): Successor => ({ version: parseVersion(options.localVersion), launcher: OWN_LAUNCHER }),
        activity: (): Activity => options.activity ?? 'idle',
        spawnWaiter: (launcher: FsPath): void => { waiters.push(launcher); },
        terminate: (): void => { terminated = true; },
        log: (line: Line): void => { lines.push(line); },
    });
    return {
        ticks: async (count: number): Promise<void> => {
            for (let tick = 0; tick < count; tick += 1) {
                running.tick?.();
                await settle();
            }
        },
        waiters,
        terminated: () => terminated,
        lines,
    };
}

test('roll: a new install that herdr reports as active, seen twice, restarts the daemon on the new checkout', async () => {
    const running = daemon(listing(NEW_ROOT, '3.4.0'), { started: '3.3.0', localVersion: '3.3.0' });
    await running.ticks(1);
    assert.deepEqual(running.waiters, [], 'the first look at the new version waits');
    await running.ticks(1);
    assert.deepEqual(running.waiters, [`${NEW_ROOT}/bin/tab-recap.mjs`], 'the waiter starts the active install, not this checkout');
    assert.equal(running.terminated(), true);
    await running.ticks(2);
    assert.equal(running.waiters.length, 1, 'it hands over once');
});

test('roll: the active install on the version the daemon started with is no reason to restart', async () => {
    const running = daemon(listing(NEW_ROOT, '3.3.0'), { started: '3.3.0', localVersion: '3.3.0' });
    await running.ticks(3);
    assert.deepEqual(running.waiters, []);
    assert.equal(running.terminated(), false);
});

test('roll: when herdr cannot be reached, the own manifest decides, and an unchanged one keeps the daemon', async () => {
    const running = daemon(unreachable, { started: '3.3.0', localVersion: '3.3.0' });
    await running.ticks(3);
    assert.deepEqual(running.waiters, []);
    assert.equal(running.terminated(), false);
});

test('roll: when herdr cannot be reached and the own manifest changed in place, the daemon restarts on its own checkout', async () => {
    const running = daemon(unreachable, { started: '3.3.0', localVersion: '3.4.0' });
    await running.ticks(2);
    assert.deepEqual(running.waiters, [OWN_LAUNCHER]);
    assert.equal(running.terminated(), true);
});

test('roll: a new active install waits while an autocompaction runs', async () => {
    const running = daemon(listing(NEW_ROOT, '3.4.0'), { started: '3.3.0', localVersion: '3.3.0', activity: 'compacting' });
    await running.ticks(3);
    assert.deepEqual(running.waiters, []);
    assert.equal(running.terminated(), false);
});

test('active install: herdr unreachable, a missing entry, a bad version or a checkout with no launcher is Unknown', async () => {
    const kinds = await Promise.all([
        new HerdrActiveInstalls(unreachable.answer, ID, present).active(),
        new HerdrActiveInstalls(listing(NEW_ROOT, '3.4.0').answer, must(parseText('missing')), present).active(),
        new HerdrActiveInstalls(listing(NEW_ROOT, 'next').answer, ID, present).active(),
        new HerdrActiveInstalls(listing(NEW_ROOT, '3.4.0').answer, ID, absent).active(),
    ]);
    assert.deepEqual(kinds.map((read) => read.kind), ['unknown', 'unknown', 'unknown', 'unknown']);
    const found = await new HerdrActiveInstalls(listing(NEW_ROOT, '3.4.0').answer, ID, present).active();
    assert.deepEqual(found, { kind: 'install', root: NEW_ROOT, version: '3.4.0', launcher: `${NEW_ROOT}/bin/tab-recap.mjs` });
});
