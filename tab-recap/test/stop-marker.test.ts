import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { markStopping, STOP_WAIT_MS, stillStopping, stoppingPid } from '../bin/stop-marker.ts';

function fixture(exits: ReadonlyMap<number, number>): { root: string; clock: { now: number; sleeps: number }; alive: (pid: number) => boolean; sleep: (ms: number) => Promise<void>; now: () => number; done: () => void } {
    const root = mkdtempSync(join(tmpdir(), 'stop-marker-'));
    const clock = { now: 0, sleeps: 0 };
    const alive = (pid: number): boolean => exits.has(pid) && clock.now < (exits.get(pid) ?? 0);
    const sleep = (ms: number): Promise<void> => {
        clock.now += ms;
        clock.sleeps += 1;
        return Promise.resolve();
    };
    return { root, clock, alive, sleep, now: (): number => clock.now, done: (): void => rmSync(root, { recursive: true, force: true }) };
}

test('no marker: nothing is stopping and the wait returns at once without sleeping', async () => {
    const f = fixture(new Map());
    try {
        assert.equal(await stillStopping(f.root, f.alive, f.sleep, f.now), false);
        assert.equal(f.clock.sleeps, 0);
    } finally {
        f.done();
    }
});

test('a stopping daemon that exits within the bound is waited for, and the wait then clears', async () => {
    const f = fixture(new Map([[4242, 5_000]]));
    try {
        markStopping(f.root, 4242);
        assert.equal(stoppingPid(f.root, f.alive), 4242);
        assert.equal(await stillStopping(f.root, f.alive, f.sleep, f.now), false);
        assert.equal(f.clock.now, 5_000);
        assert.equal(f.clock.sleeps, 20);
        assert.equal(stoppingPid(f.root, f.alive), null);
    } finally {
        f.done();
    }
});

test('a stopping daemon still alive at the bound is reported as stopping, after the bound and no later', async () => {
    const f = fixture(new Map([[77, Number.MAX_SAFE_INTEGER]]));
    try {
        markStopping(f.root, 77);
        assert.equal(await stillStopping(f.root, f.alive, f.sleep, f.now), true);
        assert.equal(f.clock.now, STOP_WAIT_MS);
        assert.equal(stoppingPid(f.root, f.alive), 77);
    } finally {
        f.done();
    }
});

test('a marker naming a process that is already gone is cleared without waiting', async () => {
    const f = fixture(new Map());
    try {
        markStopping(f.root, 9);
        assert.equal(await stillStopping(f.root, f.alive, f.sleep, f.now), false);
        assert.equal(f.clock.sleeps, 0);
        assert.equal(stoppingPid(f.root, f.alive), null);
    } finally {
        f.done();
    }
});
