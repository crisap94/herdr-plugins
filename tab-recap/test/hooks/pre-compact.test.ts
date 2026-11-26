import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHookEndpoint, type PreCompactReceiver } from '#src/adapters/hooks/endpoint.ts';
import { createPreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import { createReceiver, type ReceiverDeps } from '#src/adapters/hooks/receiver.ts';
import { createTurnEnds } from '#src/adapters/hooks/turn-ends.ts';
import type { IdleClaim } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import { parseSessionId } from '#src/recap/domain/ids.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import { laneFrom, type FollowedSession } from '#src/recap/domain/lane.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import { instant, type Instant } from '@stateforge-labs/session-ledger';
import type { HookReceiver } from '#src/wire/hooks/contract.ts';
import { seenLane } from '#test/support/seen.ts';

const NOW = 1_000_000;
const TAB = tabId('w1:t1');
const PANE = paneId('w1:p1');
const SESSION = must(parseSessionId('s-lane'));
const SESSION_TEXT = must(parseText('s-lane'));
const lane: FollowedSession = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: laneStatus('idle'), session: 's-lane', cwd: '/work/repo' }));

interface Fixture {
    readonly receiver: HookReceiver & PreCompactReceiver;
    readonly claimed: FollowedSession[];
    readonly marked: number[];
}

function fixture(claim: IdleClaim, followed = true): Fixture {
    const claimed: FollowedSession[] = [];
    const marked: number[] = [];
    const preCompacts = createPreCompacts();
    const clock = { now: (): Instant => instant(NOW) };
    const deps: ReceiverDeps = {
        followed: (harness, session) => (followed && harness === 'claude' && session === SESSION ? { tab: TAB, pane: PANE, lane } : null),
        lanesOf: () => [lane],
        observe: () => {},
        recaps: { turnEnded: () => {} },
        engine: { sessionStarted: () => {}, compacted: () => { throw new Error('not used by PreCompact'); } },
        turnEnds: createTurnEnds(clock),
        preCompacts: {
            mark: (session, at) => {
                marked.push(at.valueOf());
                preCompacts.mark(session, at);
            },
            markedAt: (session) => preCompacts.markedAt(session),
            offer: (session, text) => preCompacts.offer(session, text),
            take: (session) => preCompacts.take(session),
            served: (session) => preCompacts.served(session),
        },
        claimIdle: (seen) => {
            claimed.push(seen);
            return claim;
        },
        restoreMode: () => 'off',
        rebindMode: () => 'off',
        rebind: { rebind: async () => {} },
        clock,
        log: () => {},
    };
    return { receiver: createReceiver(deps), claimed, marked };
}

const autoCall = { session: SESSION_TEXT, trigger: 'auto' as const };

test('an auto PreCompact of a followed lane holds when claimIdle claims it, and asks claimIdle for that lane', () => {
    const { receiver, claimed, marked } = fixture('claimed');
    assert.deepEqual(receiver.preCompact(autoCall), { kind: 'hold', reason: 'tab-recap compacts this lane itself when it is idle' });
    assert.deepEqual(claimed, [lane]);
    assert.equal(marked.length, 1);
});

test('an auto PreCompact that claimIdle declines answers nothing', () => {
    const { receiver, claimed } = fixture('declined');
    assert.deepEqual(receiver.preCompact(autoCall), { kind: 'nothing' });
    assert.equal(claimed.length, 1);
});

test('a manual PreCompact is marked but never held and never asks claimIdle', () => {
    const { receiver, claimed, marked } = fixture('claimed');
    assert.deepEqual(receiver.preCompact({ session: SESSION_TEXT, trigger: 'manual' }), { kind: 'nothing' });
    assert.equal(claimed.length, 0);
    assert.equal(marked.length, 1);
});

test('a PreCompact of an unfollowed session answers nothing and asks nothing', () => {
    const { receiver, claimed, marked } = fixture('claimed', false);
    assert.deepEqual(receiver.preCompact(autoCall), { kind: 'nothing' });
    assert.equal(claimed.length, 0);
    assert.equal(marked.length, 0);
});

function postRaw(socketPath: string, path: string, body: string): Promise<{ status: number; contentType: string | undefined; body: string }> {
    return new Promise((resolve, reject) => {
        const req = request({ socketPath, method: 'POST', path, headers: { host: 'localhost', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, contentType: res.headers['content-type'], body: Buffer.concat(chunks).toString('utf8') }));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.end(body);
    });
}

async function withEndpoint(receiver: HookReceiver & PreCompactReceiver, run: (socketPath: string) => Promise<void>): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'pre-compact-'));
    const socketPath = must(parseFsPath(join(dir, 'hooks.sock')));
    try {
        const endpoint = await startHookEndpoint({ socketPath, receiver, log: () => {} });
        assert.ok(endpoint !== null, 'the endpoint starts on a free path');
        try {
            await run(socketPath);
        } finally {
            await endpoint.stop();
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('the endpoint answers an auto PreCompact of an idle lane with a JSON block body', async () => {
    const { receiver } = fixture('claimed');
    await withEndpoint(receiver, async (socketPath) => {
        const response = await postRaw(socketPath, '/pre-compact/claude', JSON.stringify({ session_id: 's-lane', trigger: 'auto', hook_event_name: 'PreCompact' }));
        assert.equal(response.status, 200);
        assert.match(response.contentType ?? '', /^application\/json/);
        assert.deepEqual(JSON.parse(response.body), { decision: 'block', reason: 'tab-recap compacts this lane itself when it is idle' });
    });
});

test('the endpoint answers a manual PreCompact, an unfollowed one and a bad body with an empty 200', async () => {
    const { receiver } = fixture('claimed');
    const unfollowed = fixture('claimed', false).receiver;
    await withEndpoint(receiver, async (socketPath) => {
        const manual = await postRaw(socketPath, '/pre-compact/claude', JSON.stringify({ session_id: 's-lane', trigger: 'manual' }));
        assert.deepEqual([manual.status, manual.body], [200, '']);
        const broken = await postRaw(socketPath, '/pre-compact/claude', '{not json');
        assert.deepEqual([broken.status, broken.body], [200, '']);
    });
    await withEndpoint(unfollowed, async (socketPath) => {
        const response = await postRaw(socketPath, '/pre-compact/claude', JSON.stringify({ session_id: 's-lane', trigger: 'auto' }));
        assert.deepEqual([response.status, response.body], [200, '']);
    });
});

test('other paths still reach the library handler', async () => {
    const { receiver } = fixture('claimed');
    await withEndpoint(receiver, async (socketPath) => {
        const response = await postRaw(socketPath, '/hook/claude', '{}');
        assert.equal(response.body.includes('block'), false);
        assert.notEqual(response.status, 500);
    });
});
