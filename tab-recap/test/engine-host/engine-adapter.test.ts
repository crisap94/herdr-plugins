import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Engine, FollowedSession, HistoryFact as LedgerHistoryFact, LedgerEvent, RestoreText, ScopeId, SessionKey } from '@stateforge-labs/session-ledger';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { createEngine, type Engine as LegacyEngine, type EnginePlugs } from '#src/recap/application/engine.ts';
import type { RunEvent } from '#src/recap/application/ledger-reconcile.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { instant } from '#src/recap/domain/time.ts';
import { FULL_WRITER_VIEW } from '#src/recap/domain/writer-view.ts';
import { memoryStore, storeRead } from '#test/db/support.ts';
import { NO_REPOS } from '#test/support.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import type { ChunkResult, Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { pluginEngine, type PluginEnginePlugs } from '#src/engine/engine-adapter.ts';
import { tabRecaps, type TabRecaps } from '#src/engine/tab-recaps.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { KeepInput } from '#src/recap/application/recap-job.ts';
import type { Text } from '#src/recap/domain/text.ts';

const TAB = 'w1:t1';
const lanes: readonly Lane[] = [
    laneFrom({ paneId: 'w1:p1', tabId: TAB, workspaceId: 'w1', agent: 'claude', session: 's1' }),
    laneFrom({ paneId: 'w1:p2', tabId: TAB, workspaceId: 'w1', agent: 'claude', session: 's2' }),
];
const [first, second] = lanes;
if (first === undefined || second === undefined) {
    throw new Error('two lanes are needed');
}
const reversed: readonly Lane[] = [second, first];

const reader: Transcripts = {
    agent: 'claude',
    inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
    locate: (lane: Lane): Promise<Located> => Promise.resolve({ kind: 'located', source: `/t/${lane.pane}` }),
    latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
    read: (source: string): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: `go ${source}` }], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: 7, tail: null }, grew: true }),
};

interface World {
    readonly store: Store;
    readonly asked: RecapRequest[];
    readonly ran: RunEvent[];
    readonly events: LedgerEvent[];
    readonly plugs: Omit<EnginePlugs, 'ran'>;
}

function world(): World {
    const store = memoryStore();
    const asked: RecapRequest[] = [];
    const ran: RunEvent[] = [];
    const events: LedgerEvent[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => {
            asked.push(request);
            return Promise.resolve({ kind: 'written', text: JSON.stringify({ ops: [{ op: 'add', section: 'goal', text: 'ship it', anchor: 'go' }] }), costUsd: 0.02 });
        },
    };
    const plugs: Omit<EnginePlugs, 'ran'> = {
        source: { transcripts: registryWith({ claude: reader }) },
        store: { records: checkedRecords(store.records), ledger: checkedLedger(store.ledger) },
        models: { summarizer: (): Summarizer => summarizer, enumerator: () => null },
        environment: { clock: { now: (): ReturnType<typeof instant> => instant(9) }, repos: NO_REPOS, mint: mintFactId, log: (): void => undefined },
        settings: { language: (): Text => brand<string, 'Text'>('en'), writerView: () => FULL_WRITER_VIEW, keepInput: (): KeepInput => brand<boolean, 'KeepInput'>(true) },
    };
    return { store, asked, ran, events, plugs };
}

const settled = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 30); });

interface Driver {
    turnEnded(tab: ReturnType<typeof tabId>, sessions: readonly Lane[], cause: 'requested'): void;
    refresh(tab: ReturnType<typeof tabId>, sessions: readonly Lane[]): Promise<void>;
    history(tab: ReturnType<typeof tabId>, session: Lane): readonly HistoryFact[];
}

function legacyDriver(at: World): LegacyEngine {
    return createEngine({ ...at.plugs, ran: (event: RunEvent): void => { at.ran.push(event); } });
}

function adapterDriver(at: World): TabRecaps {
    const plugs: PluginEnginePlugs = { ...at.plugs, on: (event: LedgerEvent): void => { at.events.push(event); } };
    return tabRecaps(pluginEngine(plugs));
}

function outcome(at: World, history: readonly Lane[]): unknown {
    const recap = storeRead(at.store.records.readRecap(TAB));
    return {
        asked: at.asked.map((request) => request.input),
        lanes: recap?.lanes,
        sections: recap?.tasks.map((task) => task.sections),
        costUsd: recap?.costUsd,
        language: recap?.language,
        history: history.map((lane) => at.store.ledger.historyOf(TAB, String(lane.pane))),
    };
}

async function both(byLegacy: (driver: Driver) => Promise<void>, byAdapter: (driver: Driver) => Promise<void>, read: readonly Lane[]): Promise<{ legacy: unknown; adapter: unknown }> {
    const [direct, faced] = [world(), world()];
    await byLegacy(legacyDriver(direct));
    await byAdapter(adapterDriver(faced));
    return { legacy: outcome(direct, read), adapter: outcome(faced, read) };
}

test('turnEnded with two lanes, the list reordered, then one lane removed gives the legacy engine\'s recaps', async () => {
    const seen = await both(
        async (driver) => {
            driver.turnEnded(tabId(TAB), lanes, 'requested'); await settled();
            driver.turnEnded(tabId(TAB), reversed, 'requested'); await settled();
            driver.turnEnded(tabId(TAB), [first], 'requested'); await settled();
        },
        async (driver) => {
            driver.turnEnded(tabId(TAB), lanes, 'requested'); await settled();
            driver.turnEnded(tabId(TAB), reversed, 'requested'); await settled();
            driver.turnEnded(tabId(TAB), [first], 'requested'); await settled();
        },
        lanes,
    );
    assert.deepEqual(seen.adapter, seen.legacy);
    assert.notDeepEqual((seen.legacy as { asked: unknown[] }).asked, []);
});

test('refresh with two lanes, then the same list reordered, gives the legacy engine\'s recaps and history', async () => {
    const seen = await both(
        async (driver) => { await driver.refresh(tabId(TAB), lanes); await driver.refresh(tabId(TAB), reversed); },
        async (driver) => { await driver.refresh(tabId(TAB), lanes); await driver.refresh(tabId(TAB), reversed); },
        lanes,
    );
    assert.deepEqual(seen.adapter, seen.legacy);
    assert.deepEqual((seen.legacy as { history: unknown[] }).history.map((facts) => (facts as HistoryFact[]).map((fact) => [fact.section, fact.text, fact.state])), [[['goal', 'ship it', 'open']], [['goal', 'ship it', 'open']]]);
});

test('history of a lane removed from the list gives the legacy engine\'s facts', async () => {
    const seen = await both(
        async (driver) => { await driver.refresh(tabId(TAB), lanes); await driver.refresh(tabId(TAB), [first]); },
        async (driver) => { await driver.refresh(tabId(TAB), lanes); await driver.refresh(tabId(TAB), [first]); },
        lanes,
    );
    assert.deepEqual(seen.adapter, seen.legacy);
});

test('the adapter reports each recap as a recap-written event, as the legacy run event', async () => {
    const [direct, faced] = [world(), world()];
    await legacyDriver(direct).refresh(tabId(TAB), lanes);
    await adapterDriver(faced).refresh(tabId(TAB), lanes);
    assert.deepEqual(faced.events.filter((event) => event.kind === 'recap-written'), direct.ran.map((event) => ({ kind: 'recap-written', scope: event.tab, turns: event.turns, boundary: event.boundary, cause: event.cause })));
    assert.notDeepEqual(faced.events, []);
});

interface Spy {
    readonly calls: string[];
    readonly engine: Engine;
}

function spy(): Spy {
    const calls: string[] = [];
    const engine: Engine = {
        follow: (scope: ScopeId, session: FollowedSession): void => { calls.push(`follow ${scope} ${session.key}`); },
        unfollow: (scope: ScopeId, key: SessionKey): void => { calls.push(`unfollow ${scope} ${key}`); },
        followedBy: (): null => null,
        turnEnded: (): void => undefined,
        sessionStarted: (): void => undefined,
        refresh: (): Promise<void> => Promise.resolve(),
        flush: (): Promise<void> => Promise.resolve(),
        flushAll: (): Promise<void> => Promise.resolve(),
        compacted: (): RestoreText => { throw new Error('sync does not compact'); },
        history: (): readonly LedgerHistoryFact[] => [],
        curate: (): Promise<void> => Promise.resolve(),
    };
    return { calls, engine };
}

test('sync with the same list twice follows each lane again and unfollows nothing', () => {
    const at = spy();
    const recaps = tabRecaps(at.engine);
    recaps.sync(tabId(TAB), lanes);
    recaps.sync(tabId(TAB), lanes);
    assert.deepEqual(at.calls, ['follow w1:t1 w1:p1', 'follow w1:t1 w1:p2', 'follow w1:t1 w1:p1', 'follow w1:t1 w1:p2']);
});

test('sync with a reordered list unfollows every remembered key, then follows in the new order', () => {
    const at = spy();
    const recaps = tabRecaps(at.engine);
    recaps.sync(tabId(TAB), lanes);
    recaps.sync(tabId(TAB), reversed);
    assert.deepEqual(at.calls, ['follow w1:t1 w1:p1', 'follow w1:t1 w1:p2', 'unfollow w1:t1 w1:p1', 'unfollow w1:t1 w1:p2', 'follow w1:t1 w1:p2', 'follow w1:t1 w1:p1']);
});

test('sync with a removed lane unfollows every remembered key, then follows what remains', () => {
    const at = spy();
    const recaps = tabRecaps(at.engine);
    recaps.sync(tabId(TAB), lanes);
    recaps.sync(tabId(TAB), [first]);
    assert.deepEqual(at.calls, ['follow w1:t1 w1:p1', 'follow w1:t1 w1:p2', 'unfollow w1:t1 w1:p1', 'unfollow w1:t1 w1:p2', 'follow w1:t1 w1:p1']);
});

test('sync with an empty list unfollows every remembered key and follows nothing', () => {
    const at = spy();
    const recaps = tabRecaps(at.engine);
    recaps.sync(tabId(TAB), lanes);
    recaps.sync(tabId(TAB), []);
    assert.deepEqual(at.calls, ['follow w1:t1 w1:p1', 'follow w1:t1 w1:p2', 'unfollow w1:t1 w1:p1', 'unfollow w1:t1 w1:p2']);
});
