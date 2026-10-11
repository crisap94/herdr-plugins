import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractClaude } from '#src/adapters/claude-rows.ts';
import { extractCodex } from '#src/adapters/codex-transcripts.ts';
import { queuedOutcomeOf, verdictOf } from '#src/recap/application/compaction-outcome.ts';
import type { QueuedDeps } from '#src/recap/application/compaction-outcome.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';

const row = (fields: Record<string, unknown>): string => JSON.stringify({ timestamp: '2026-10-07T10:00:05Z', ...fields });
const AT = Date.parse('2026-10-07T10:00:05Z');

test('claude: a compact_boundary row is a compaction; an `Error during compaction` local command is a failure; ordinary rows are neither', () => {
    const { marks } = extractClaude([
        row({ type: 'user', message: { content: 'hello' } }),
        row({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual', preTokens: 100 } }),
        row({ type: 'system', subtype: 'local_command', content: '<local-command-stderr>Error during compaction: summarization produced empty response</local-command-stderr>' }),
        row({ type: 'user', message: { content: '<local-command-stderr>Error during compaction: x</local-command-stderr>' } }),
        row({ type: 'assistant', message: { content: [{ type: 'text', text: 'Error during compaction would be a funny thing to say' }] } }),
        'not json',
    ]);
    assert.deepEqual(marks, [{ kind: 'compacted', at: AT, tokensBefore: 100, trigger: 'manual' }, { kind: 'compaction-failed', at: AT }, { kind: 'compaction-failed', at: AT }]);
});

test('codex: a `compacted` row is a compaction', () => {
    const { marks } = extractCodex([row({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ text: 'hi' }] } }), row({ type: 'compacted', payload: { message: '' } })]);
    assert.deepEqual(marks, [{ kind: 'compacted', at: AT }]);
});

test('the verdict: the newest mark from the command on wins; none, older or undated is unconfirmed', () => {
    const since = instant(AT - 1000);
    assert.equal(verdictOf([], since), 'unconfirmed');
    assert.equal(verdictOf([{ kind: 'compacted', at: since - 1 }], since), 'unconfirmed');
    assert.equal(verdictOf([{ kind: 'compacted', at: null }], since), 'unconfirmed');
    assert.equal(verdictOf([{ kind: 'compacted', at: AT }], since), 'compacted');
    assert.equal(verdictOf([{ kind: 'compaction-failed', at: AT }], since), 'failed');
    assert.equal(verdictOf([{ kind: 'compaction-failed', at: AT }, { kind: 'compacted', at: AT + 1 }], since), 'compacted', 'a retry that worked');
});

test('a queued compaction: every settle with no mark keeps the wait, the first turn end calls back once, and the bound with no mark is unconfirmed', async () => {
    const clock = { t: AT };
    let turnEnds = 0;
    const deps: QueuedDeps = {
        settling: { settled: () => { clock.t += 60_000; return Promise.resolve({ kind: 'settled', status: 'idle' }); } },
        marks: () => Promise.resolve([]),
        pause: () => Promise.resolve(),
        now: () => instant(clock.t),
    };
    const verdict = await queuedOutcomeOf(deps, laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' }), instant(AT), () => { turnEnds += 1; });
    assert.deepEqual([verdict.outcome, turnEnds, clock.t - AT], ['unconfirmed', 1, 10 * 60_000]);
});

interface Push { readonly at: number; readonly status: string }

interface World { readonly deps: QueuedDeps; readonly clock: { t: number }; readonly settleCalls: number[]; turnEnds: number; readonly markReads: { n: number } }

const queuedWorld = (pushes: readonly Push[], markAt: number | null, unknownSettles = false): World => {
    const clock = { t: AT };
    const settleCalls: number[] = [];
    const markReads = { n: 0 };
    const deps: QueuedDeps = {
        settling: {
            settled: (_pane, since, timeoutMs) => {
                settleCalls.push(clock.t);
                if (settleCalls.length > 400) throw new Error('the wait does not progress');
                if (unknownSettles) return Promise.resolve({ kind: 'settled', status: 'unknown' });
                const heard = pushes.find((push) => push.at >= since && push.at <= clock.t + timeoutMs);
                if (heard === undefined) { clock.t += timeoutMs; return Promise.resolve({ kind: 'timeout' }); }
                clock.t = Math.max(clock.t, heard.at);
                return Promise.resolve({ kind: 'settled', status: heard.status });
            },
        },
        marks: () => { markReads.n += 1; return Promise.resolve(markAt !== null && clock.t >= markAt ? [{ kind: 'compacted', at: markAt }] : []); },
        pause: (ms) => { clock.t += ms; return Promise.resolve(); },
        now: () => instant(clock.t),
    };
    return { deps, clock, settleCalls, turnEnds: 0, markReads };
};

const queuedLane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' });

test('a queued compaction: a settle heard while the marks are read is seen by the next slice at once, and the turn end is reported once', async () => {
    const world = queuedWorld([{ at: AT + 5000, status: 'idle' }, { at: AT + 5500, status: 'done' }], AT + 7000);
    const verdict = await queuedOutcomeOf(world.deps, queuedLane, instant(AT), () => { world.turnEnds += 1; });
    assert.deepEqual([verdict.outcome, world.turnEnds], ['compacted', 1]);
    assert.ok(world.settleCalls[2] !== undefined && world.settleCalls[2] - AT < 10_000, 'the push heard during the first marks read ends the second wait at once');
});

test('a queued compaction: a settle heard before a slice began does not end that slice again', async () => {
    const world = queuedWorld([{ at: AT + 5000, status: 'idle' }], AT + 200_000);
    const verdict = await queuedOutcomeOf(world.deps, queuedLane, instant(AT), () => { world.turnEnds += 1; });
    assert.deepEqual([verdict.outcome, world.turnEnds], ['compacted', 1]);
    assert.ok(world.settleCalls.length < 10, `slices of the wait: ${world.settleCalls.length}`);
});

test('a queued compaction: a status that is not a turn end is not one, and the marks are read about once a second at most', async () => {
    const world = queuedWorld([], AT + 30_000, true);
    const verdict = await queuedOutcomeOf(world.deps, queuedLane, instant(AT), () => { world.turnEnds += 1; });
    assert.deepEqual([verdict.outcome, world.turnEnds], ['compacted', 0]);
    assert.ok(world.settleCalls.length <= 31, `waits in 30 s of fake clock: ${world.settleCalls.length}`);
});
