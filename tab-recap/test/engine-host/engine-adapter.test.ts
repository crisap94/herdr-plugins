import { textOf } from '@stateforge-labs/session-ledger';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Engine, FollowedSession as Followed, HistoryFact as LedgerHistoryFact, LedgerEvent, RestoreText, ScopeId, SessionKey } from '@stateforge-labs/session-ledger';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { legacyCreateEngine as createEngine, type LegacyEnginePlugs as EnginePlugs } from '@stateforge-labs/session-ledger';
import type { LegacyRecapWritten as RecapWritten } from '@stateforge-labs/session-ledger';
import { tabId, agentKind, paneId } from '#test/support/ids.ts';
import { laneFrom, seatOf } from '#src/recap/domain/lane.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import type { HistoryFact } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { FULL_WRITER_VIEW } from '@stateforge-labs/session-ledger';
import { memoryStore, storeRead } from '#test/db/support.ts';
import { NO_REPOS } from '#test/support.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { RecapRequest, Written } from '@stateforge-labs/session-ledger';
import type { LegacyWriter as Writer } from '@stateforge-labs/session-ledger';
import type { ChunkResult, Located, PromptResult } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { pluginEngine, type PluginEnginePlugs } from '#src/engine/engine-adapter.ts';
import { tabRecaps, type TabRecaps } from '#src/engine/tab-recaps.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import { brand } from '@stateforge-labs/session-ledger';
import type { LegacyKeepInput as KeepInput } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import { cursorOf, grewOf, sourcePathOf } from '@stateforge-labs/session-ledger';
import { seenLane } from '#test/support/seen.ts';

const TAB = 'w1:t1';
const lanes: readonly FollowedSession[] = [
    laneFrom(seenLane({ paneId: 'w1:p1', tabId: TAB, workspaceId: 'w1', agent: 'claude', session: 's1' })),
    laneFrom(seenLane({ paneId: 'w1:p2', tabId: TAB, workspaceId: 'w1', agent: 'claude', session: 's2' })),
];
const [first, second] = lanes;
if (first === undefined || second === undefined) {
    throw new Error('two lanes are needed');
}
const reversed: readonly FollowedSession[] = [second, first];

const reader: SessionReader = {
    agent: agentKind('claude'),
    inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
    locate: (lane): Promise<Located> => Promise.resolve({ kind: 'located', source: sourcePathOf(`/t/${lane.key}`) }),
    latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
    read: (source: string): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: textOf(`go ${source}`) }], title: null, lastPrompt: null, harnessRecap: null, notes: [], position: { cursor: cursorOf(7), tail: null }, grew: grewOf(true) }),
};

interface World {
    readonly store: Store;
    readonly asked: RecapRequest[];
    readonly ran: RecapWritten[];
    readonly events: LedgerEvent[];
    readonly plugs: Omit<EnginePlugs, 'ran'>;
}

function world(): World {
    const store = memoryStore();
    const asked: RecapRequest[] = [];
    const ran: RecapWritten[] = [];
    const events: LedgerEvent[] = [];
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => {
            asked.push(request);
            return Promise.resolve({ kind: 'written', text: textOf(JSON.stringify({ ops: [{ op: 'add', section: 'goal', text: 'ship it', anchor: 'go' }] })), costUsd: brand<number, 'Usd'>(0.02) });
        },
    };
    const plugs: Omit<EnginePlugs, 'ran'> = {
        source: { transcripts: registryWith({ claude: reader }) },
        store: { records: checkedRecords(store.records), ledger: checkedLedger(store.ledger) },
        models: { summarizer: (): Writer => summarizer, enumerator: () => null },
        environment: { clock: { now: (): ReturnType<typeof instant> => instant(9) }, repos: NO_REPOS, mint: mintFactId, log: (): void => undefined },
        settings: { language: (): Text => brand<string, 'Text'>('en'), writerView: () => FULL_WRITER_VIEW, keepInput: (): KeepInput => brand<boolean, 'KeepInput'>(true) },
    };
    return { store, asked, ran, events, plugs };
}

const settled = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 30); });

interface Driver {
    turnEnded(tab: ReturnType<typeof tabId>, sessions: readonly FollowedSession[], cause: 'requested'): void;
    refresh(tab: ReturnType<typeof tabId>, sessions: readonly FollowedSession[]): Promise<void>;
    history(tab: ReturnType<typeof tabId>, session: FollowedSession): readonly HistoryFact[];
}

function legacyDriver(at: World): Driver {
    const engine = createEngine({ ...at.plugs, ran: (event: RecapWritten): void => { at.ran.push(event); } });
    return {
        turnEnded: (tab, sessions, cause) => { engine.turnEnded(tab, sessions.map(seatOf), cause); },
        refresh: (tab, sessions) => engine.refresh(tab, sessions.map(seatOf)),
        history: (tab, session) => engine.history(tab, seatOf(session)),
    };
}

function adapterDriver(at: World): TabRecaps {
    const plugs: PluginEnginePlugs = { ...at.plugs, on: (event: LedgerEvent): void => { at.events.push(event); } };
    return tabRecaps(pluginEngine(plugs));
}

function outcome(at: World, history: readonly FollowedSession[]): unknown {
    const recap = storeRead(at.store.records.readRecap(tabId(TAB)));
    return {
        asked: at.asked.map((request) => request.input),
        lanes: recap?.sessions,
        sections: recap?.tasks.map((task) => task.sections),
        costUsd: recap?.costUsd,
        language: recap?.language,
        history: history.map((lane) => at.store.ledger.historyOf(tabId(TAB), paneId(String(lane.pane)))),
    };
}

async function both(byLegacy: (driver: Driver) => Promise<void>, byAdapter: (driver: Driver) => Promise<void>, read: readonly FollowedSession[]): Promise<{ legacy: unknown; adapter: unknown }> {
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
    assert.deepEqual(faced.events.filter((event) => event.kind === 'recap-written'), direct.ran.map((event) => ({ kind: 'recap-written', scope: event.scope, turns: event.turns, boundary: event.boundary, cause: event.cause })));
    assert.notDeepEqual(faced.events, []);
});

interface Spy {
    readonly calls: string[];
    readonly engine: Engine;
}

function spy(): Spy {
    const calls: string[] = [];
    const engine: Engine = {
        follow: (scope: ScopeId, session: Followed): void => { calls.push(`follow ${scope} ${session.key}`); },
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
