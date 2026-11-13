import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FollowedSession, ScopeId } from '../../tab-recap/src/recap/application/engine.ts';
import { composeEngine, followedOf, openingOf } from '../src/compose.ts';
import { LOCK_DIR, SessionLock, processAlive, processStartOf } from '../src/lock.ts';
import type { LockPlugs } from '../src/lock.ts';
import { parsePayload } from '../src/payload.ts';
import { fileLog, LOG_FILE, MAX_ROUNDS, runAfterStop } from '../src/runner.ts';
import type { RunnerOpening, RunnerPlugs } from '../src/runner.ts';
import { TURNS, tempHost } from './support/host.ts';
import type { TempHost } from './support/host.ts';
import { spawnedNow } from './support/spawn.ts';

const TAKE_LOCK = join(import.meta.dirname, 'support', 'take-lock.ts');

interface Gate {
    readonly passed: Promise<void>;
    open(): void;
}

function gate(): Gate {
    let open = (): void => undefined;
    const passed = new Promise<void>((resolve) => { open = resolve; });
    return { passed, open };
}

interface Recorded {
    readonly calls: (readonly [ScopeId, readonly FollowedSession[]])[];
    readonly opened: { count: number; closed: number };
    readonly open: () => RunnerOpening;
}

function recorded(fail: (call: number) => Error | null = () => null): Recorded {
    const calls: (readonly [ScopeId, readonly FollowedSession[]])[] = [];
    const opened = { count: 0, closed: 0 };
    return {
        calls, opened,
        open: (): RunnerOpening => {
            opened.count += 1;
            return {
                kind: 'opened',
                opened: {
                    engine: {
                        refresh: (scope, sessions): Promise<void> => {
                            calls.push([scope, sessions]);
                            const error = fail(calls.length);
                            return error === null ? Promise.resolve() : Promise.reject(error);
                        },
                    },
                    close: (): void => { opened.closed += 1; },
                },
            };
        },
    };
}

const lockPlugs = (host: TempHost, over: Partial<LockPlugs> = {}): LockPlugs => ({ dir: join(host.stateDir, LOCK_DIR), pid: process.pid, now: Date.now, alive: processAlive, startOf: processStartOf, ...over });

function runnerPlugs(host: TempHost, over: Partial<RunnerPlugs> & Pick<RunnerPlugs, 'open'>): RunnerPlugs {
    return { lock: new SessionLock(host.hook.session, lockPlugs(host)), followed: followedOf(host.hook), settle: () => Promise.resolve(), log: host.plugs.log, ...over };
}

test('a Stop during the settle of a running refresh marks it dirty: one run and one rerun, and the second runner only marks', async () => {
    const host = tempHost();
    try {
        const engine = recorded();
        const settling = gate();
        const entered = gate();
        let settles = 0;
        const settle = async (): Promise<void> => {
            settles += 1;
            if (settles === 1) {
                entered.open();
                await settling.passed;
            }
        };
        const first = runAfterStop(runnerPlugs(host, { open: engine.open, settle }));
        await entered.passed;
        const second = await runAfterStop(runnerPlugs(host, { open: engine.open, settle }));
        assert.deepEqual(second, { kind: 'marked' });
        settling.open();
        assert.deepEqual(await first, { kind: 'ran', rounds: 2 });
        assert.equal(engine.calls.length, 2);
        assert.deepEqual(engine.opened, { count: 1, closed: 1 }, 'the ledger is opened once for both rounds and closed after');
        const lock = new SessionLock(host.hook.session, lockPlugs(host));
        assert.equal(existsSync(lock.path), false, 'the lock is released');
        assert.equal(lock.isDirty(), false, 'the dirty marker is cleared');
    } finally {
        host.dispose();
    }
});

test('refresh is called with the scope and the session derived from the Stop payload', async () => {
    const host = tempHost();
    try {
        const stop = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'payloads', 'Stop-01-base.json'), 'utf8')) as Record<string, unknown>;
        const parsed = parsePayload(JSON.stringify({ ...stop, session_id: host.hook.session, transcript_path: host.hook.records, cwd: host.hook.cwd }));
        assert.equal(parsed.kind, 'event');
        if (parsed.kind !== 'event') {
            return;
        }
        const engine = recorded();
        const followed = followedOf(parsed.event);
        assert.deepEqual(await runAfterStop(runnerPlugs(host, { open: engine.open, followed })), { kind: 'ran', rounds: 1 });
        assert.deepEqual(engine.calls, [[followed.scope, [followed.session]]]);
        assert.equal(String(engine.calls[0]?.[0]), `claude-code:${host.hook.session}`);
        assert.equal(String(engine.calls[0]?.[1][0]?.session), host.hook.session);
    } finally {
        host.dispose();
    }
});

test('a lock left by a runner that died is stolen by the next Stop, which runs', async () => {
    const host = tempHost();
    try {
        const died = spawnedNow([TAKE_LOCK, join(host.stateDir, LOCK_DIR), host.hook.session, '0']);
        assert.equal(died.out, 'taken');
        const lock = new SessionLock(host.hook.session, lockPlugs(host));
        assert.ok(existsSync(lock.path), 'the dead runner left its lock behind');
        const engine = recorded();
        assert.deepEqual(await runAfterStop(runnerPlugs(host, { open: engine.open })), { kind: 'ran', rounds: 1 });
        assert.equal(engine.calls.length, 1);
        assert.ok(host.logged.some((line) => line.startsWith('took over the lock')), host.logged.join('\n'));
        assert.equal(existsSync(lock.path), false);
    } finally {
        host.dispose();
    }
});

test('a lock held by a live process is respected: the Stop only marks dirty and the holder reruns for it', async () => {
    const host = tempHost();
    try {
        const holder = new SessionLock(host.hook.session, lockPlugs(host, { pid: process.ppid })).take();
        assert.equal(holder.kind, 'taken');
        const engine = recorded();
        assert.deepEqual(await runAfterStop(runnerPlugs(host, { open: engine.open })), { kind: 'marked' });
        assert.equal(engine.calls.length, 0);
        assert.equal(engine.opened.count, 0, 'a runner that only marks never opens the ledger');
        assert.equal(new SessionLock(host.hook.session, lockPlugs(host)).isDirty(), true);
    } finally {
        host.dispose();
    }
});

test('a refresh that throws is logged, the lock released and the ledger closed; nothing reaches the caller', async () => {
    const host = tempHost();
    try {
        const engine = recorded(() => new Error('writer exploded'));
        const result = await runAfterStop(runnerPlugs(host, { open: engine.open }));
        assert.deepEqual(result, { kind: 'failed', rounds: 0, detail: 'writer exploded' });
        assert.ok(host.logged.some((line) => line.includes('writer exploded')));
        assert.equal(existsSync(new SessionLock(host.hook.session, lockPlugs(host)).path), false);
        assert.deepEqual(engine.opened, { count: 1, closed: 1 });
        const next = recorded();
        assert.deepEqual(await runAfterStop(runnerPlugs(host, { open: next.open })), { kind: 'ran', rounds: 1 }, 'the next Stop is not blocked');
    } finally {
        host.dispose();
    }
});

test('a ledger that cannot be opened is a logged failure with the lock released', async () => {
    const host = tempHost();
    try {
        const result = await runAfterStop(runnerPlugs(host, { open: (): RunnerOpening => ({ kind: 'refused', detail: 'newer ledger' }) }));
        assert.deepEqual(result, { kind: 'failed', rounds: 0, detail: 'newer ledger' });
        assert.equal(existsSync(new SessionLock(host.hook.session, lockPlugs(host)).path), false);
    } finally {
        host.dispose();
    }
});

test('a Stop on every round keeps the runner going only up to its bound, and the last mark stays for the next Stop', async () => {
    const host = tempHost();
    try {
        const lock = new SessionLock(host.hook.session, lockPlugs(host));
        const engine = recorded();
        const settle = (): Promise<void> => { lock.markDirty(); return Promise.resolve(); };
        assert.deepEqual(await runAfterStop(runnerPlugs(host, { open: engine.open, settle })), { kind: 'ran', rounds: MAX_ROUNDS });
        assert.equal(engine.calls.length, MAX_ROUNDS);
        assert.equal(lock.isDirty(), true);
    } finally {
        host.dispose();
    }
});

test('a Stop that lands after the last check but before the release is picked up by taking the lock again', async () => {
    const host = tempHost();
    try {
        const lock = new SessionLock(host.hook.session, lockPlugs(host));
        const engine = recorded();
        let refreshes = 0;
        const open = (): RunnerOpening => {
            const inner = engine.open();
            if (inner.kind !== 'opened') {
                return inner;
            }
            return {
                kind: 'opened',
                opened: {
                    engine: { refresh: async (scope, sessions): Promise<void> => { await inner.opened.engine.refresh(scope, sessions); refreshes += 1; } },
                    close: (): void => { inner.opened.close(); },
                },
            };
        };
        const marking: SessionLock = Object.assign(Object.create(Object.getPrototypeOf(lock) as object) as SessionLock, lock, {
            isDirty: (): boolean => {
                const dirty = lock.isDirty();
                if (refreshes === 1 && !dirty) {
                    refreshes += 1;
                    lock.markDirty();
                    return false;
                }
                return dirty;
            },
        });
        assert.deepEqual(await runAfterStop(runnerPlugs(host, { open, lock: marking })), { kind: 'ran', rounds: 2 });
        assert.equal(engine.calls.length, 2);
    } finally {
        host.dispose();
    }
});

test('errors go to a log file under the state folder, and a log that cannot be written is dropped silently', () => {
    const host = tempHost();
    try {
        fileLog(host.stateDir, () => Date.parse('2026-11-12T10:00:00Z'))('refresh failed: boom');
        assert.equal(readFileSync(join(host.stateDir, LOG_FILE), 'utf8'), '2026-11-12T10:00:00.000Z refresh failed: boom\n');
        mkdirSync(join(host.root, 'blocked'));
        writeFileSync(join(host.root, 'blocked', 'file'), '');
        assert.doesNotThrow(() => { fileLog(join(host.root, 'blocked', 'file'))('lost'); });
    } finally {
        host.dispose();
    }
});

test('end to end with the fake writer: three Stops over the replay transcript leave three runs and the facts in the session ledger', async () => {
    const host = tempHost();
    try {
        const plugs = (): RunnerPlugs => runnerPlugs(host, { open: openingOf(host.plugs) });
        for (const turn of [0, 1, 2]) {
            host.grow(TURNS.slice(turn * 2, turn * 2 + 2));
            assert.deepEqual(await runAfterStop(plugs()), { kind: 'ran', rounds: 1 }, `turn ${turn + 1}`);
        }
        const composed = composeEngine(host.plugs);
        assert.equal(composed.kind, 'ready');
        if (composed.kind !== 'ready') {
            return;
        }
        const followed = followedOf(host.hook);
        const tab = String(followed.scope);
        assert.equal(composed.store.inputs.runs({ tab, since: null, limit: 10, withInput: false }).length, 3);
        assert.deepEqual(composed.engine.history(followed.scope, followed.session).map((fact) => fact.text).toSorted(), ['Add a cart to the shop', 'Added cart totals in src/totals.ts', 'Store carts in SQLite']);
        const restored = composed.engine.restore(followed.scope, followed.session);
        assert.equal(restored.open.length + restored.closed.length, 3);
        composed.close();
        assert.ok(existsSync(join(host.stateDir, 'ledger.db')));
        assert.deepEqual(host.logged.filter((line) => line.includes('failed')), []);
    } finally {
        host.dispose();
    }
});
