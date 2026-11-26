import { textOf } from '@stateforge-labs/session-ledger';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { legacyCreateEngine as createEngine, type LegacyEngine as Engine, type LegacyEnginePlugs as EnginePlugs } from '@stateforge-labs/session-ledger';
import { RecapJob, type RecapJobDeps } from '@stateforge-labs/session-ledger';
import type { LegacyRecapWritten as RecapWritten } from '@stateforge-labs/session-ledger';
import { tabId, agentKind, paneId } from '#test/support/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { FULL_WRITER_VIEW } from '@stateforge-labs/session-ledger';
import { memoryStore, storeRead } from '#test/db/support.ts';
import { NO_REPOS } from '#test/support.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { RecapRequest, Written } from '@stateforge-labs/session-ledger';
import type { LegacyWriter as Writer } from '@stateforge-labs/session-ledger';
import type { ChunkResult, Located, PromptResult } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
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

const reader: SessionReader = {
    agent: agentKind('claude'),
    inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
    locate: (lane: FollowedSession): Promise<Located> => Promise.resolve({ kind: 'located', source: sourcePathOf(`/t/${lane.pane}`) }),
    latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
    read: (source: string): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: textOf(`go ${source}`) }], title: null, lastPrompt: null, harnessRecap: null, notes: [], position: { cursor: cursorOf(7), tail: null }, grew: grewOf(true) }),
};

interface World {
    readonly store: Store;
    readonly asked: RecapRequest[];
    readonly ran: RecapWritten[];
    readonly deps: RecapJobDeps;
    readonly plugs: EnginePlugs;
}

function world(): World {
    const store = memoryStore();
    const asked: RecapRequest[] = [];
    const ran: RecapWritten[] = [];
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => {
            asked.push(request);
            return Promise.resolve({ kind: 'written', text: textOf(JSON.stringify({ ops: [{ op: 'add', section: 'goal', text: 'ship it', anchor: 'go' }] })), costUsd: brand<number, 'Usd'>(0.02) });
        },
    };
    const plugs: EnginePlugs = {
        source: { transcripts: registryWith({ claude: reader }) },
        store: { records: checkedRecords(store.records), ledger: checkedLedger(store.ledger) },
        models: { summarizer: (): Writer => summarizer, enumerator: () => null },
        environment: { clock: { now: (): ReturnType<typeof instant> => instant(9) }, repos: NO_REPOS, mint: mintFactId, log: (): void => undefined },
        settings: { language: (): Text => brand<string, 'Text'>('en'), writerView: () => FULL_WRITER_VIEW, keepInput: (): KeepInput => brand<boolean, 'KeepInput'>(true) },
        ran: (event): void => { ran.push(event); },
    };
    const deps: RecapJobDeps = { ...plugs.source, ...plugs.store, ...plugs.models, ...plugs.environment, ...plugs.settings, ran: (event): void => { ran.push(event); } };
    return { store, asked, ran, deps, plugs };
}

const settled = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 30); });

function outcome(at: World): unknown {
    const recap = storeRead(at.store.records.readRecap(tabId(TAB)));
    return {
        asked: at.asked.map((request) => request.input),
        ran: at.ran,
        lanes: recap?.sessions,
        sections: recap?.tasks.map((task) => task.sections),
        costUsd: recap?.costUsd,
        language: recap?.language,
        history: lanes.map((lane) => at.store.ledger.historyOf(tabId(TAB), paneId(String(lane.pane)))),
    };
}

async function both(byJob: (job: RecapJob) => Promise<void>, byEngine: (engine: Engine) => Promise<void>): Promise<{ job: unknown; engine: unknown }> {
    const [direct, faced] = [world(), world()];
    await byJob(new RecapJob(direct.deps));
    await byEngine(createEngine(faced.plugs));
    return { job: outcome(direct), engine: outcome(faced) };
}

test('turnEnded asks the job for a recap of the same scope, sessions and cause, with the same result', async () => {
    const seen = await both(
        async (job) => { job.request(tabId(TAB), lanes, 'requested'); await settled(); },
        async (engine) => { engine.turnEnded(tabId(TAB), lanes, 'requested'); await settled(); },
    );
    assert.deepEqual(seen.engine, seen.job);
    assert.notDeepEqual((seen.job as { asked: unknown[] }).asked, []);
});

test('refresh and compacted resolve once the recap is written, as refreshNow does, with the same result', async () => {
    const refreshed = await both((job) => job.refreshNow(tabId(TAB), lanes), (engine) => engine.refresh(tabId(TAB), lanes));
    const compacted = await both((job) => job.refreshNow(tabId(TAB), lanes), (engine) => engine.compacted(tabId(TAB), lanes));
    assert.deepEqual(refreshed.engine, refreshed.job);
    assert.deepEqual(compacted.engine, compacted.job);
    assert.deepEqual((refreshed.job as { ran: RecapWritten[] }).ran.map((event) => event.cause), ['requested']);
});

test('sessionStarted has no effect in this slice: no run, no record', async () => {
    const at = world();
    const engine = createEngine(at.plugs);
    engine.sessionStarted(tabId(TAB), lanes);
    await settled();
    assert.deepEqual(at.asked, []);
    assert.deepEqual(at.ran, []);
    assert.equal(storeRead(at.store.records.readRecap(tabId(TAB))), null);
});

test('history returns the ledger\'s facts of the scope and the session, not text', async () => {
    const at = world();
    const engine = createEngine(at.plugs);
    await engine.refresh(tabId(TAB), lanes);
    const [first] = lanes;
    assert.ok(first !== undefined);
    const history = engine.history(tabId(TAB), first);
    assert.deepEqual(history, at.store.ledger.historyOf(tabId(TAB), paneId(String(first.pane))));
    assert.deepEqual(history.map((fact) => [fact.section, fact.text, fact.state]), [['goal', 'ship it', 'open']]);
});
