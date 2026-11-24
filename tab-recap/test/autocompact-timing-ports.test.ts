import assert from 'node:assert/strict';
import { policyOf, tuningOf } from './fakes/settings-readers.ts';
import { test } from 'node:test';
import { wireAutocompact } from '#src/daemon/autocompact.ts';
import type { Settings } from '#src/daemon/config.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import { LaneClaims } from '#src/recap/application/lane-claims.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { DeciderPort } from '#src/ports/decider.ts';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import type { SessionReader } from '#src/ports/transcripts.ts';
import { memoryStore } from './db/support.ts';
import { decidedOf, textOf } from './fakes/decider-fixtures.ts';
import { SAFE, candidateFor } from './autocompact-world.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { agentKind, paneId } from '#test/support/ids.ts';
import { sourcePathOf } from '#src/ports/transcripts.ts';
import { runningOf } from '#src/recap/domain/in-flight.ts';
import { seenLane } from '#test/support/seen.ts';

interface Scripted {
    readonly store: ReturnType<typeof memoryStore>;
    readonly events: string[];
    readonly flushed: string[];
    readonly service: ReturnType<typeof wireAutocompact>;
    readonly lane: ReturnType<typeof laneFrom>;
}

const transcripts: SessionReader = {
    agent: agentKind('claude'),
    locate: () => Promise.resolve({ kind: 'located', source: sourcePathOf('transcript') }),
    read: () => Promise.reject(new Error('not read here')),
    latestPrompt: () => Promise.reject(new Error('not read here')),
    inFlight: { kind: 'supported', split: { kind: 'foreground-only', why: 'codex-cells' }, read: () => Promise.resolve({ kind: 'in-flight', count: runningOf(0), background: [] }) },
};

function scripted(claims: LaneClaims): Scripted {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const events: string[] = [];
    const flushed: string[] = [];
    const decider: DeciderPort = { label: textOf('fake'), ask: () => Promise.resolve(decidedOf(SAFE)) };
    const service = wireAutocompact({
        config: (): Settings => ({ autocompact: { ...policyOf(() => undefined), mode: 'on' }, tuning: tuningOf(() => undefined) }) as unknown as Settings,
        awaiting: () => Promise.resolve({ kind: 'clear' }), store, claims,
        transcripts: registryWith({ claude: transcripts }),
        contexts: { of: () => ({ tokens: 620_000, window: 1_000_000, source: 'observed' }) } as unknown as LaneContexts,
        recent: { of: () => Promise.resolve([]) } as unknown as LaneRecent,
        recaps: { refresh: (): Promise<void> => Promise.resolve(), flush: (tab): Promise<void> => { flushed.push(String(tab)); return Promise.resolve(); } } satisfies Pick<TabRecaps, 'refresh' | 'flush'>,
        informer: { current: emptyBoard() } as unknown as Informer, decider: () => decider,
        events: { lane: (pane, kind, detail) => { events.push(`${pane} ${kind} ${detail ?? ''}`); }, inWorkspace: () => undefined }, log: () => undefined,
    });
    const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' }));
    return { store, events, flushed, service, lane };
}

test('wireAutocompact over fake store, claims and events: a safe lane flushes the recap, requests one compaction and emits the decided value', async () => {
    const world = scripted(new LaneClaims());
    await world.service.consider(candidateFor(world.lane));
    assert.deepEqual(world.flushed, ['w1:t1']);
    assert.deepEqual(world.store.requests.takeCompactions().map((ask) => [ask.tab, ask.pane, ask.origin]), [['w1:t1', 'w1:p1', 'auto']]);
    assert.deepEqual(world.events, ['w1:p1 autocompact-decided compact-62']);
});

test('wireAutocompact: a claimed lane is skipped as busy through the activity port and emits the skipped gate', async () => {
    const claims = new LaneClaims();
    claims.claim(paneId('w1:p1'), 'compaction');
    const world = scripted(claims);
    await world.service.consider(candidateFor(world.lane));
    assert.deepEqual(world.store.requests.takeCompactions(), []);
    assert.deepEqual(world.events, ['w1:p1 autocompact-skipped busy']);
});

test('wireAutocompact: the stored row keeps the status of the lane the candidate was made from, idle or done', async () => {
    const statuses = ['idle', 'done'];
    const stored: (string | null)[] = [];
    for (const status of statuses) {
        const world = scripted(new LaneClaims());
        await world.service.consider(candidateFor(laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status }))));
        stored.push(world.store.decisions.newest(must(parseCount(1)))[0]?.laneStatus ?? null);
    }
    assert.deepEqual(stored, ['idle', 'done']);
});
