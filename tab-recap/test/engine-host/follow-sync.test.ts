import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { memoryStore } from '#test/db/support.ts';
import { NO_REPOS } from '#test/support.ts';
import type { Summarizer, Written } from '#src/ports/summarizer.ts';
import type { ChunkResult, Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { keyOf, pluginEngine, scopeOf, type PluginEnginePlugs } from '#src/engine/engine-adapter.ts';
import { tabRecaps } from '#src/engine/tab-recaps.ts';
import { onBeatOf } from '#src/daemon/follow-board.ts';
import { PACING_TURN } from '#src/recap/domain/pacing.ts';
import { emptyBoard, type Board } from '#src/recap/domain/board.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom, type Lane } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import { FULL_WRITER_VIEW } from '#src/recap/domain/writer-view.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';

const TAB = 'w1:t1';
const lanes: readonly Lane[] = [
    laneFrom({ paneId: 'w1:p1', tabId: TAB, workspaceId: 'w1', agent: 'claude', session: 's1' }),
    laneFrom({ paneId: 'w1:p2', tabId: TAB, workspaceId: 'w1', agent: 'claude', session: 's2' }),
];
const [first] = lanes;
if (first === undefined) {
    throw new Error('two lanes are needed');
}

const settled = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 30); });

function boardWith(published: readonly Lane[]): Board {
    return { ...emptyBoard(), lanes: new Map(published.map((lane) => [lane.pane, lane])) };
}

test('a board with two lanes, published with no turn ended and no refresh, makes compacted refresh both lanes, and a board without them makes it refresh none', async () => {
    const located: string[] = [];
    const store = memoryStore();
    const reader: Transcripts = {
        agent: 'claude',
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
        locate: (lane: Lane): Promise<Located> => {
            located.push(lane.pane);
            return Promise.resolve({ kind: 'located', source: `/t/${lane.pane}` });
        },
        latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
        read: (source: string): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: `go ${source}` }], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: 7, tail: null }, grew: true }),
    };
    const summarizer: Summarizer = {
        backend: 'fake',
        contract: 'strict',
        write: (): Promise<Written> => {
            return Promise.resolve({ kind: 'written', text: JSON.stringify({ ops: [{ op: 'add', section: 'goal', text: 'ship it', anchor: 'go' }] }), costUsd: 0.02 });
        },
    };
    const plugs: PluginEnginePlugs = {
        source: { transcripts: registryWith({ claude: reader }) },
        store: { records: checkedRecords(store.records), ledger: checkedLedger(store.ledger) },
        models: { summarizer: (): Summarizer => summarizer, enumerator: () => null },
        environment: { clock: { now: (): ReturnType<typeof instant> => instant(9) }, repos: NO_REPOS, mint: mintFactId, log: (): void => undefined },
        settings: { language: (): string => 'en', writerView: () => FULL_WRITER_VIEW, keepInput: (): boolean => true },
    };
    const engine = pluginEngine(plugs);
    const recaps = tabRecaps(engine);
    let board: Board = emptyBoard();
    const beat = onBeatOf((): void => undefined, recaps, (): Board => board, PACING_TURN);
    const scope = scopeOf(tabId(TAB));
    const key = keyOf(first.pane);
    if (scope === null || key === null) {
        throw new Error('the tab and the pane are valid ids');
    }

    board = boardWith(lanes);
    beat();
    engine.compacted(scope, key);
    await settled();
    assert.deepEqual([...new Set(located)].toSorted(), ['w1:p1', 'w1:p2']);

    const before = located.length;
    board = emptyBoard();
    beat();
    engine.compacted(scope, key);
    await settled();
    assert.equal(located.length, before);
});
