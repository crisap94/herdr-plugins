import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { outcomeOf } from '#src/recap/application/compaction-outcome.ts';
import { SettleHub } from '#src/recap/application/settle-hub.ts';
import type { SettleHubDeps } from '#src/recap/application/settle-hub.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import type { Mark } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';

const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' });

function hub(options: { listening: boolean; statuses?: string[]; clock?: { at: number } }): { hub: SettleHub; polls: string[]; pauses: number[] } {
    const polls: string[] = [];
    const pauses: number[] = [];
    const statuses = options.statuses ?? [];
    const clock = options.clock ?? { at: 1000 };
    const deps: SettleHubDeps = {
        agents: { status: () => { polls.push('status'); const next = statuses.shift(); return Promise.resolve(next === undefined ? unknown({ why: 'not-found', what: 'pane' }) : { kind: 'agent', agent: 'claude', status: next as 'idle' }); } },
        listening: () => options.listening,
        pause: (ms) => { pauses.push(ms); return Promise.resolve(); },
        now: () => clock.at,
    };
    return { hub: new SettleHub(deps), polls, pauses };
}

test('a push settles the waiter at once: the first idle/done after `since`, with no status poll; working does not', async () => {
    const { hub: waiting, polls } = hub({ listening: true });
    const settled = waiting.settled('w1:p1', 1000, 60_000);
    waiting.heard('w1:p1', 'working');
    waiting.heard('w1:p2', 'done');
    let resolved = false;
    void settled.then((done) => { resolved = true; return done; });
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    assert.equal(resolved, false, 'neither a working push nor another lane\'s done settles it');
    waiting.heard('w1:p1', 'done');
    assert.deepEqual(await settled, { kind: 'settled', status: 'done' });
    assert.deepEqual(polls, [], 'push → confirmed without polls');
});

test('a push that came between the typing and the wait is not lost; one from before `since` does not count', async () => {
    const clock = { at: 900 };
    const { hub: early } = hub({ listening: true, clock });
    early.heard('w1:p1', 'idle');
    clock.at = 1200;
    assert.deepEqual(await early.settled('w1:p1', 1000, 5), { kind: 'timeout' }, 'an idle push from before the command says nothing about it');
    early.heard('w1:p1', 'done');
    assert.deepEqual(await early.settled('w1:p1', 1000, 5), { kind: 'settled', status: 'done' });
});

test('listening but silent: after the timeout the lane is looked at once, and a lane that settled unheard still counts', async () => {
    const quiet = hub({ listening: true, statuses: ['idle'] });
    assert.deepEqual(await quiet.hub.settled('w1:p1', 1000, 5), { kind: 'settled', status: 'idle' });
    const stuck = hub({ listening: true, statuses: ['working'] });
    assert.deepEqual(await stuck.hub.settled('w1:p1', 1000, 5), { kind: 'timeout' });
});

test('blind (no subscription): today\'s polling — a pause for the agent to start, then a status every 2 s until idle or done', async () => {
    const blind = hub({ listening: false, statuses: ['working', 'working', 'idle'] });
    assert.deepEqual(await blind.hub.settled('w1:p1', 1000, 600_000), { kind: 'settled', status: 'idle' });
    assert.deepEqual(blind.pauses, [4000, 2000, 2000]);
    assert.equal(blind.polls.length, 3);
    const lost = hub({ listening: false, statuses: ['working', 'working', 'working', 'working', 'working', 'working'] });
    assert.deepEqual(await lost.hub.settled('w1:p1', 1000, 9000), { kind: 'timeout' }, 'bounded by the timeout');
});

const compacted = (at: number): Mark => ({ kind: 'compacted', at, tokensBefore: 39532, tokensAfter: 3057, tookMs: 15588 });

test('the outcome: after the push the records are read at once; they say nothing yet → up to three more reads 300 ms apart', async () => {
    const pauses: number[] = [];
    const settled: string[] = [];
    const settling: LaneSettling = { settled: (pane) => { settled.push(pane); return Promise.resolve({ kind: 'settled', status: 'done' }); } };
    let reads = 0;
    const deps = { settling, pause: (ms: number): Promise<void> => { pauses.push(ms); return Promise.resolve(); }, marks: (): Promise<readonly Mark[]> => { reads += 1; return Promise.resolve(reads >= 3 ? [compacted(2000)] : []); } };
    assert.deepEqual(await outcomeOf(deps, lane, 1000), { outcome: 'compacted', tokensBefore: 39532, tokensAfter: 3057, tookMs: 15588 });
    assert.deepEqual([settled, reads, pauses], [['w1:p1'], 3, [300, 300]]);
    reads = 0;
    pauses.length = 0;
    const never = { ...deps, marks: (): Promise<readonly Mark[]> => { reads += 1; return Promise.resolve([]); } };
    assert.deepEqual(await outcomeOf(never, lane, 1000), { outcome: 'unconfirmed' });
    assert.deepEqual([reads, pauses], [4, [300, 300, 300]]);
});

test('the outcome: a failure mark is not re-read; the numbers a record lacks are left out; settle=false (codex waits in its own prompt) does not wait on the hub', async () => {
    const settled: string[] = [];
    const settling: LaneSettling = { settled: (pane) => { settled.push(pane); return Promise.resolve({ kind: 'timeout' }); } };
    const pauses: number[] = [];
    const base = { settling, pause: (ms: number): Promise<void> => { pauses.push(ms); return Promise.resolve(); } };
    assert.deepEqual(await outcomeOf({ ...base, marks: (): Promise<readonly Mark[]> => Promise.resolve([{ kind: 'compaction-failed', at: 2000 }]) }, lane, 1000), { outcome: 'failed' });
    assert.deepEqual(await outcomeOf({ ...base, marks: (): Promise<readonly Mark[]> => Promise.resolve([{ kind: 'compacted', at: 2000 }]) }, lane, 1000, false), { outcome: 'compacted' });
    assert.deepEqual([settled, pauses], [['w1:p1'], []]);
});
