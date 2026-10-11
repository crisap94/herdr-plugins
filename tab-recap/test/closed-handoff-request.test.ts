import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRequests } from './fakes/requests.ts';
import { MemoryHandoffAnswers } from './fakes/handoff-answers.ts';
import { deliverHandoff, type DaemonReading, type DeliverDeps } from '#src/recap/application/handoff-request.ts';
import type { HandoffRequestRow } from '#src/ports/requests.ts';
import { isStorablePair } from '#src/recap/domain/handoff-outcome.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { NOW } from './fakes/handoff-flow-harness.ts';

const RUNNING: DaemonReading = { pid: 4242, version: '2.4.0' };
const PANE = paneId('w1:p1');
const CLOSED_AT = instant(NOW - 60_000);

test('a closed source whose pane id is the target pane is queued as a closed request, not refused source-equals-target', async () => {
    const requests = new MemoryRequests(() => NOW);
    const answers = new MemoryHandoffAnswers(isStorablePair, () => NOW);
    const taken: HandoffRequestRow[] = [];
    let now = NOW;
    const deps: DeliverDeps = {
        pacing: {
            now: () => now,
            sleep: async (ms) => {
                now += ms;
                taken.push(...requests.takeHandoffs());
            },
        },
        daemon: () => RUNNING,
        cliVersion: '2.4.0',
        openStore: () => ({ views: { tabOf: () => null }, requests, handoffs: answers, close: () => undefined }),
    };
    const outcome = await deliverHandoff({ from: PANE, to: PANE, note: null, refresh: false, closed: { tab: tabId('w1:t1'), pane: PANE, closedAt: CLOSED_AT } }, deps);
    assert.notEqual(outcome.kind, 'refused');
    assert.equal(taken.length, 1);
    assert.deepEqual(taken[0]?.source, { kind: 'closed', closedAt: CLOSED_AT });
    assert.equal(taken[0]?.tab, 'w1:t1');
});
