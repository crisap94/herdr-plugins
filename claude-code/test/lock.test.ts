import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_MAX_HOLD_MS, SessionLock, UNWRITTEN_GRACE_MS, lockKeyOf, processAlive } from '../src/lock.ts';
import type { LockPlugs } from '../src/lock.ts';
import { spawned, spawnedNow } from './support/spawn.ts';

const SESSION = '00000000-0000-4000-8000-000000000001';
const TAKE_LOCK = join(import.meta.dirname, 'support', 'take-lock.ts');

function scratch(): { readonly dir: string; dispose(): void } {
    const dir = mkdtempSync(join(tmpdir(), 'claude-code-lock-'));
    return { dir, dispose: (): void => { rmSync(dir, { recursive: true, force: true }); } };
}

const plugsOf = (dir: string, over: Partial<LockPlugs> = {}): LockPlugs => ({ dir, pid: 4242, now: () => 1_000_000, alive: () => true, maxHoldMs: DEFAULT_MAX_HOLD_MS, ...over });

function deadPid(): number {
    const ran = spawnedNow(['-e', '0']);
    assert.equal(ran.code, 0);
    return ran.pid;
}

test('a free lock is taken, a second take is refused while the holder lives, and a release frees it', () => {
    const { dir, dispose } = scratch();
    try {
        const first = new SessionLock(SESSION, plugsOf(dir)).take();
        assert.equal(first.kind, 'taken');
        const second = new SessionLock(SESSION, plugsOf(dir, { pid: 5151 })).take();
        assert.deepEqual(second.kind === 'held' ? second.by?.pid : null, 4242);
        if (first.kind === 'taken') {
            first.release();
        }
        assert.equal(new SessionLock(SESSION, plugsOf(dir, { pid: 5151 })).take().kind, 'taken');
    } finally {
        dispose();
    }
});

test('a lock whose holder is dead is stolen, and so is one held past the longest hold', () => {
    const { dir, dispose } = scratch();
    try {
        const alive = new Set([4242]);
        const first = new SessionLock(SESSION, plugsOf(dir, { alive: (pid) => alive.has(pid) })).take();
        assert.equal(first.kind, 'taken');
        alive.delete(4242);
        const thief = new SessionLock(SESSION, plugsOf(dir, { pid: 5151, alive: (pid) => alive.has(pid) || pid === 5151 })).take();
        assert.equal(thief.kind, 'taken');
        assert.equal(thief.kind === 'taken' ? thief.stole?.pid : null, 4242);
        const late = new SessionLock(SESSION, plugsOf(dir, { pid: 6161, now: () => 1_000_000 + DEFAULT_MAX_HOLD_MS + 1 })).take();
        assert.equal(late.kind === 'taken' ? late.stole?.pid : null, 5151, 'a live pid past the longest hold is taken as reused');
        if (first.kind === 'taken') {
            first.release();
        }
        assert.ok(existsSync(new SessionLock(SESSION, plugsOf(dir)).path), 'a release by a holder that was stolen from leaves the new holder in place');
        assert.deepEqual(readdirSync(join(dir)).filter((name) => name.includes('.stale-')), []);
    } finally {
        dispose();
    }
});

test('a lock file still being written is respected for a grace time, then stolen', () => {
    const { dir, dispose } = scratch();
    try {
        const lock = new SessionLock(SESSION, plugsOf(dir));
        mkdirSync(dir, { recursive: true });
        writeFileSync(lock.path, '');
        const now = Date.now();
        assert.deepEqual(new SessionLock(SESSION, plugsOf(dir, { now: () => now })).take(), { kind: 'held', by: null });
        utimesSync(lock.path, (now - UNWRITTEN_GRACE_MS - 1000) / 1000, (now - UNWRITTEN_GRACE_MS - 1000) / 1000);
        assert.equal(new SessionLock(SESSION, plugsOf(dir, { now: () => now })).take().kind, 'taken');
    } finally {
        dispose();
    }
});

test('the dirty marker is set, seen and cleared once', () => {
    const { dir, dispose } = scratch();
    try {
        const lock = new SessionLock(SESSION, plugsOf(dir));
        assert.equal(lock.isDirty(), false);
        assert.equal(lock.takeDirty(), false);
        lock.markDirty();
        lock.markDirty();
        assert.equal(lock.isDirty(), true);
        assert.equal(lock.takeDirty(), true);
        assert.equal(lock.takeDirty(), false);
    } finally {
        dispose();
    }
});

test('a session id becomes one file name inside the lock folder', () => {
    assert.equal(lockKeyOf(SESSION), SESSION);
    for (const session of ['..', '../../etc/passwd', 'a/b', 'a\\b']) {
        assert.ok(!lockKeyOf(session).includes('/') && !lockKeyOf(session).includes('\\') && !lockKeyOf(session).startsWith('.'), session);
    }
});

test('processAlive tells this process from one that has exited', () => {
    assert.equal(processAlive(process.pid), true);
    assert.equal(processAlive(deadPid()), false);
});

test('processes racing for one lock: exactly one takes it, and a holder that exits without releasing does not block the next', async () => {
    const { dir, dispose } = scratch();
    try {
        const startAt = String(Date.now() + 400);
        const racers = await Promise.all(Array.from({ length: 4 }, () => spawned([TAKE_LOCK, dir, SESSION, startAt])));
        assert.deepEqual(racers.map((racer) => racer.out).toSorted(), ['held', 'held', 'held', 'taken']);
        const next = new SessionLock(SESSION, { dir, pid: process.pid, now: Date.now, alive: processAlive, maxHoldMs: DEFAULT_MAX_HOLD_MS }).take();
        assert.equal(next.kind, 'taken', 'the racer that won exited without a release, so its lock is stale');
        assert.notEqual(next.kind === 'taken' ? next.stole : null, null);
    } finally {
        dispose();
    }
});
