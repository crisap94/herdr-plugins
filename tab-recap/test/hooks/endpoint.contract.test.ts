import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RestoreText } from '@stateforge-labs/session-ledger';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHookEndpoint, type HookEndpoint } from '#src/adapters/hooks/endpoint.ts';
import { createPreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import { createReceiver, type ReceiverDeps } from '#src/adapters/hooks/receiver.ts';
import { createTurnEnds } from '#src/adapters/hooks/turn-ends.ts';
import type { Line } from '#src/daemon/slots.ts';
import { must } from '#src/protocol/result.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import { laneFrom, type Lane } from '#src/recap/domain/lane.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { SOCKET_PATH_MAX } from '#src/wire/socket-claim.ts';
import { postHook, readHookCases } from '#test/contracts/wire/fakes/fake-harness.ts';
import type { HookCase } from '#test/contracts/wire/fakes/fake-harness.ts';

const NOW = 1_000_000;
const TAB = tabId('w1:t1');
const PANE = paneId('w1:p1');
const CASES = readHookCases();

const isRestoreText = (text: string): text is RestoreText => typeof text === 'string';

const restoreOf = (text: string): RestoreText => {
    if (isRestoreText(text)) {
        return text;
    }
    throw new Error('every string is a restore text in the fake');
};

type LaneStatusName = NonNullable<HookCase['lane']>['status'];

const laneOf = (status: LaneStatusName): Lane =>
    laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: laneStatus(status), session: 's-lane', cwd: '/work/repo' });

function receiverFor(c: HookCase | null): ReturnType<typeof createReceiver> {
    const lane = laneOf(c?.lane?.status ?? 'idle');
    const restore = restoreOf(c?.answer.kind === 'context' ? c.answer.text : '');
    const clock = { now: (): Instant => instant(NOW) };
    const deps: ReceiverDeps = {
        followed: () => (c?.followed === true ? { tab: TAB, pane: PANE, lane } : null),
        lanesOf: () => [lane],
        observe: () => {},
        recaps: { turnEnded: () => {} },
        engine: { sessionStarted: () => {}, compacted: () => restore },
        turnEnds: createTurnEnds(clock),
        preCompacts: createPreCompacts(),
        claimIdle: () => 'declined',
        restoreMode: () => 'on',
        clock,
        log: () => {},
    };
    return createReceiver(deps);
}

function scratchDir(): string {
    return mkdtempSync(join(tmpdir(), 'hook-endpoint-'));
}

function getHealth(socketPath: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const req = request({ socketPath, method: 'GET', path: '/healthz', headers: { host: 'localhost' } }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.end();
    });
}

for (const c of CASES) {
    test(`${c.name}: the endpoint replies the exact body of the case`, async () => {
        const dir = scratchDir();
        const socketPath = must(parseFsPath(join(dir, 'hooks.sock')));
        try {
            const endpoint = await startHookEndpoint({ socketPath, receiver: receiverFor(c), log: () => {} });
            assert.ok(endpoint !== null, 'the endpoint starts on a free path');
            try {
                const response = await postHook(socketPath, c.harness, c.request);
                assert.equal(response.status, 200, c.name);
                assert.deepEqual(JSON.parse(response.body), c.reply, c.name);
            } finally {
                await endpoint.stop();
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
}

test('the endpoint answers GET /healthz with ok, and stop unlinks its socket', async () => {
    const dir = scratchDir();
    const socketPath = must(parseFsPath(join(dir, 'hooks.sock')));
    try {
        const endpoint = await startHookEndpoint({ socketPath, receiver: receiverFor(null), log: () => {} });
        assert.ok(endpoint !== null);
        assert.deepEqual(await getHealth(socketPath), { status: 200, body: 'ok' });
        await endpoint.stop();
        assert.equal(existsSync(socketPath), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the socket of a running endpoint is readable and writable by its owner only', async () => {
    const dir = scratchDir();
    const socketPath = must(parseFsPath(join(dir, 'hooks.sock')));
    try {
        const endpoint = await startHookEndpoint({ socketPath, receiver: receiverFor(null), log: () => {} });
        assert.ok(endpoint !== null);
        try {
            assert.equal(statSync(socketPath).mode & 0o777, 0o600);
        } finally {
            await endpoint.stop();
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a live listener already on the path is left untouched: the second start gives null with one log line', async () => {
    const dir = scratchDir();
    const socketPath = must(parseFsPath(join(dir, 'hooks.sock')));
    const logged: Line[] = [];
    let first: HookEndpoint | null = null;
    try {
        first = await startHookEndpoint({ socketPath, receiver: receiverFor(null), log: () => {} });
        assert.ok(first !== null);
        const second = await startHookEndpoint({ socketPath, receiver: receiverFor(null), log: (line) => logged.push(line) });
        assert.equal(second, null);
        assert.equal(logged.length, 1);
        assert.deepEqual(await getHealth(socketPath), { status: 200, body: 'ok' });
    } finally {
        await first?.stop();
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a stale file left on the path is replaced by a new endpoint', async () => {
    const dir = scratchDir();
    const socketPath = must(parseFsPath(join(dir, 'hooks.sock')));
    try {
        writeFileSync(socketPath, '');
        const endpoint = await startHookEndpoint({ socketPath, receiver: receiverFor(null), log: () => {} });
        assert.ok(endpoint !== null);
        try {
            assert.deepEqual(await getHealth(socketPath), { status: 200, body: 'ok' });
        } finally {
            await endpoint.stop();
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a socket path over SOCKET_PATH_MAX is refused with one log line and no socket', async () => {
    const dir = scratchDir();
    const socketPath = must(parseFsPath(join(dir, 'x'.repeat(SOCKET_PATH_MAX))));
    const logged: Line[] = [];
    try {
        const endpoint = await startHookEndpoint({ socketPath, receiver: receiverFor(null), log: (line) => logged.push(line) });
        assert.equal(endpoint, null);
        assert.equal(logged.length, 1);
        assert.equal(existsSync(socketPath), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the endpoint makes the socket directory owner-only before it listens, so no other user can reach the socket', async () => {
    const dir = scratchDir();
    const shared = join(dir, 'hooks');
    mkdirSync(shared);
    chmodSync(shared, 0o755);
    const socketPath = must(parseFsPath(join(shared, 'hooks.sock')));
    try {
        const endpoint = await startHookEndpoint({ socketPath, receiver: receiverFor(null), log: () => {} });
        assert.ok(endpoint !== null);
        try {
            assert.equal(statSync(shared).mode & 0o777, 0o700);
        } finally {
            await endpoint.stop();
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the endpoint creates a missing socket directory owner-only', async () => {
    const dir = scratchDir();
    const socketPath = must(parseFsPath(join(dir, 'hooks', 'hooks.sock')));
    try {
        const endpoint = await startHookEndpoint({ socketPath, receiver: receiverFor(null), log: () => {} });
        assert.ok(endpoint !== null);
        try {
            assert.equal(statSync(join(dir, 'hooks')).mode & 0o777, 0o700);
            assert.equal(existsSync(socketPath), true);
        } finally {
            await endpoint.stop();
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
