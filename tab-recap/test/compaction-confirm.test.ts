import { test } from 'node:test';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import assert from 'node:assert/strict';
import { LaneRecent } from '#src/recap/application/lane-recent.ts';
import { outcomeOf } from '#src/recap/application/compaction-outcome.ts';
import type { OutcomeDeps } from '#src/recap/application/compaction-outcome.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Mark, Transcripts } from '#src/ports/transcripts.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';

const SINCE = Date.parse('2026-10-10T02:21:48Z');
const compactedAt = (at: number): Mark => ({ kind: 'compacted', at, tokensBefore: 54_709, tokensAfter: 4_460, tookMs: 4_000 });

function claude(files: ReadonlyMap<string, readonly Mark[]>): Transcripts {
    return {
        agent: 'claude',
        inFlight: { kind: 'unsupported', why: 'test reader does not expose in-flight work' },
        locate: (lane: Lane) => Promise.resolve(lane.session === null ? unknown({ why: 'not-found', what: 'a session id' }) : { kind: 'located' as const, source: `/projects/x/${lane.session}.jsonl` }),
        read: (source) => Promise.resolve({ kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, notes: [], marks: files.get(source) ?? [], position: UNREAD, grew: false }),
        latestPrompt: () => Promise.resolve({ kind: 'prompt', text: null }),
    };
}

function confirm(recent: LaneRecent, lane: Lane): Promise<string> {
    const deps: OutcomeDeps = {
        settling: { settled: () => Promise.resolve({ kind: 'settled', status: 'done' }) },
        marks: (each) => recent.marks(each),
        pause: () => Promise.resolve(),
    };
    return outcomeOf(deps, lane, SINCE, true).then((verdict) => verdict.outcome);
}

test('a brand-new agent: its lane has no session yet, herdr reports one now, and the compaction is confirmed in that session', async () => {
    const files = new Map([['/projects/x/S-new.jsonl', [compactedAt(SINCE + 4_000)]]]);
    const recent = new LaneRecent(registryWith({ claude: claude(files) }), () => Promise.resolve('S-new'));
    const lane = laneFrom({ paneId: 'w21:pBZ', tabId: 'w21:t1', workspaceId: 'w21', agent: 'claude', session: null });
    assert.equal(await confirm(recent, lane), 'compacted');
});

test('a resumed agent: its lane holds the session it had, herdr reports the new one, and the compaction is confirmed in the new one', async () => {
    const files = new Map([['/projects/x/S-old.jsonl', []], ['/projects/x/S-new.jsonl', [compactedAt(SINCE + 4_000)]]]);
    const recent = new LaneRecent(registryWith({ claude: claude(files) }), () => Promise.resolve('S-new'));
    const lane = laneFrom({ paneId: 'w28:p1', tabId: 'w28:t1', workspaceId: 'w28', agent: 'claude', session: 'S-old' });
    assert.equal(await confirm(recent, lane), 'compacted');
});

test('herdr cannot say the session: the lane as the board holds it is read, as before', async () => {
    const files = new Map([['/projects/x/S-old.jsonl', [compactedAt(SINCE + 4_000)]]]);
    const recent = new LaneRecent(registryWith({ claude: claude(files) }), () => Promise.resolve(unknown({ why: 'unreachable', detail: 'pane.get' })));
    const lane = laneFrom({ paneId: 'w28:p1', tabId: 'w28:t1', workspaceId: 'w28', agent: 'claude', session: 'S-old' });
    assert.equal(await confirm(recent, lane), 'compacted');
});
