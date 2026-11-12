import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { createEngine, type Engine, type EnginePlugs } from '#src/recap/application/engine.ts';
import { RecapJob, type RecapJobDeps } from '#src/recap/application/recap-job.ts';
import type { RunEvent } from '#src/recap/application/ledger-reconcile.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import { FULL_WRITER_VIEW } from '#src/recap/domain/writer-view.ts';
import { memoryStore } from '#test/db/support.ts';
import { NO_REPOS } from '#test/support.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import type { ChunkResult, Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';

const TAB = 'w1:t1';
const lanes: readonly Lane[] = [
    laneFrom({ paneId: 'w1:p1', tabId: TAB, workspaceId: 'w1', agent: 'claude', session: 's1' }),
    laneFrom({ paneId: 'w1:p2', tabId: TAB, workspaceId: 'w1', agent: 'claude', session: 's2' }),
];

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
    readonly deps: RecapJobDeps;
    readonly plugs: EnginePlugs;
}

function world(): World {
    const store = memoryStore();
    const asked: RecapRequest[] = [];
    const ran: RunEvent[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => {
            asked.push(request);
            return Promise.resolve({ kind: 'written', text: JSON.stringify({ ops: [{ op: 'add', section: 'goal', text: 'ship it', anchor: 'go' }] }), costUsd: 0.02 });
        },
    };
    const plugs: EnginePlugs = {
        source: { transcripts: registryWith({ claude: reader }) },
        store: { records: store.records, ledger: store.ledger },
        models: { summarizer: (): Summarizer => summarizer, enumerator: () => null },
        environment: { clock: { now: (): ReturnType<typeof instant> => instant(9) }, repos: NO_REPOS, log: (): void => undefined },
        settings: { language: (): string => 'en', writerView: () => FULL_WRITER_VIEW, keepInput: (): boolean => true },
        ran: (event): void => { ran.push(event); },
    };
    const deps: RecapJobDeps = { ...plugs.source, ...plugs.store, ...plugs.models, ...plugs.environment, ...plugs.settings, ran: (event): void => { ran.push(event); } };
    return { store, asked, ran, deps, plugs };
}

const settled = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 30); });

function outcome(at: World): unknown {
    const recap = at.store.records.readRecap(TAB);
    return {
        asked: at.asked.map((request) => request.input),
        ran: at.ran,
        lanes: recap?.lanes,
        sections: recap?.tasks.map((task) => task.sections),
        costUsd: recap?.costUsd,
        language: recap?.language,
        history: lanes.map((lane) => at.store.ledger.historyOf(TAB, String(lane.pane))),
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
    assert.deepEqual((refreshed.job as { ran: RunEvent[] }).ran.map((event) => event.cause), ['requested']);
});

test('sessionStarted has no effect in this slice: no run, no record', async () => {
    const at = world();
    const engine = createEngine(at.plugs);
    engine.sessionStarted(tabId(TAB), lanes);
    await settled();
    assert.deepEqual(at.asked, []);
    assert.deepEqual(at.ran, []);
    assert.equal(at.store.records.readRecap(TAB), null);
});

test('history returns the ledger\'s facts of the scope and the session, not text', async () => {
    const at = world();
    const engine = createEngine(at.plugs);
    await engine.refresh(tabId(TAB), lanes);
    const [first] = lanes;
    assert.ok(first !== undefined);
    const history = engine.history(tabId(TAB), first);
    assert.deepEqual(history, at.store.ledger.historyOf(TAB, String(first.pane)));
    assert.deepEqual(history.map((fact) => [fact.section, fact.text, fact.state]), [['goal', 'ship it', 'open']]);
});
