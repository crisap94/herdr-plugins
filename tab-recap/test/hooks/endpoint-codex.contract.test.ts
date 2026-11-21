import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RestoreText } from '@stateforge-labs/session-ledger';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHookEndpoint } from '#src/adapters/hooks/endpoint.ts';
import { createPreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import { createReceiver, type ReceiverDeps } from '#src/adapters/hooks/receiver.ts';
import { createTurnEnds } from '#src/adapters/hooks/turn-ends.ts';
import { must } from '#src/protocol/result.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { laneFrom, type Lane } from '#src/recap/domain/lane.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import type { HookCase } from '#test/contracts/wire/fakes/fake-harness.ts';
import { postHook } from '#test/contracts/wire/fakes/fake-harness.ts';

const NOW = 1_000_000;
const TAB = tabId('w1:t1');
const PANE = paneId('w1:p1');
const CASES: readonly HookCase[] = readFileSync(new URL('./fixtures/cases-codex.ndjson', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line): HookCase => JSON.parse(line));

const isRestoreText = (text: string): text is RestoreText => typeof text === 'string';

const restoreOf = (text: string): RestoreText => {
    if (isRestoreText(text)) {
        return text;
    }
    throw new Error('every string is a restore text in the fake');
};

const laneOf = (status: NonNullable<HookCase['lane']>['status']): Lane =>
    laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex', status: laneStatus(status), session: 'cx-lane', cwd: '/work/repo' });

function receiverFor(c: HookCase): ReturnType<typeof createReceiver> {
    const lane = laneOf(c.lane?.status ?? 'idle');
    const restore = restoreOf(c.answer.kind === 'context' ? c.answer.text : '');
    const clock = { now: (): Instant => instant(NOW) };
    const deps: ReceiverDeps = {
        followed: () => (c.followed ? { tab: TAB, pane: PANE, lane } : null),
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

for (const c of CASES) {
    test(`codex ${c.name}: the endpoint replies the exact body of the case`, async () => {
        const dir = mkdtempSync(join(tmpdir(), 'codex-endpoint-'));
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
