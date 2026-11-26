import { textOf } from '@stateforge-labs/session-ledger';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { memoryStore } from '#test/db/support.ts';
import { NO_REPOS } from '#test/support.ts';
import type { Written } from '@stateforge-labs/session-ledger';
import type { LegacyWriter as Writer } from '@stateforge-labs/session-ledger';
import type { ChunkResult, Located, PromptResult } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { keyOf, pluginEngine, scopeOf, type PluginEnginePlugs } from '#src/engine/engine-adapter.ts';
import { tabRecaps } from '#src/engine/tab-recaps.ts';
import { onBeatOf } from '#src/daemon/follow-board.ts';
import { PACING_TURN, type Pacing } from '@stateforge-labs/session-ledger';
import { createFakeEngine, duration } from '@stateforge-labs/session-ledger/testkit';
import { emptyBoard, type Board } from '#src/recap/domain/board.ts';
import { tabId, agentKind } from '#test/support/ids.ts';
import { laneFrom, type FollowedSession } from '#src/recap/domain/lane.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { FULL_WRITER_VIEW } from '@stateforge-labs/session-ledger';
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
const [first] = lanes;
if (first === undefined) {
    throw new Error('two lanes are needed');
}

const settled = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 30); });

function boardWith(published: readonly FollowedSession[]): Board {
    return { ...emptyBoard(), lanes: new Map(published.map((lane) => [lane.pane, lane])) };
}

test('a board with two lanes, published with no turn ended and no refresh, makes compacted refresh both lanes, and a board without them makes it refresh none', async () => {
    const located: string[] = [];
    const store = memoryStore();
    const reader: SessionReader = {
        agent: agentKind('claude'),
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
        locate: (lane): Promise<Located> => {
            located.push(lane.key);
            return Promise.resolve({ kind: 'located', source: sourcePathOf(`/t/${lane.key}`) });
        },
        latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
        read: (source: string): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: textOf(`go ${source}`) }], title: null, lastPrompt: null, harnessRecap: null, notes: [], position: { cursor: cursorOf(7), tail: null }, grew: grewOf(true) }),
    };
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (): Promise<Written> => {
            return Promise.resolve({ kind: 'written', text: textOf(JSON.stringify({ ops: [{ op: 'add', section: 'goal', text: 'ship it', anchor: 'go' }] })), costUsd: brand<number, 'Usd'>(0.02) });
        },
    };
    const plugs: PluginEnginePlugs = {
        source: { transcripts: registryWith({ claude: reader }) },
        store: { records: checkedRecords(store.records), ledger: checkedLedger(store.ledger) },
        models: { summarizer: (): Writer => summarizer, enumerator: () => null },
        environment: { clock: { now: (): ReturnType<typeof instant> => instant(9) }, repos: NO_REPOS, mint: mintFactId, log: (): void => undefined },
        settings: { language: (): Text => brand<string, 'Text'>('en'), writerView: () => FULL_WRITER_VIEW, keepInput: (): KeepInput => brand<boolean, 'KeepInput'>(true) },
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

function beatsUnder(pacing: Pacing): readonly string[] {
    const engine = createFakeEngine();
    let board: Board = emptyBoard();
    const beat = onBeatOf((): void => undefined, tabRecaps(engine), (): Board => board, pacing);
    beat();
    board = boardWith(lanes);
    beat();
    board = boardWith(lanes.slice(0, 1));
    beat();
    board = boardWith(lanes);
    beat();
    return engine.calls();
}

test('under smart pacing the first beat with lanes ends a turn on every tab, which also follows its sessions, and later beats only follow; under turn pacing no beat ends a turn', () => {
    const smart: Pacing = { kind: 'smart', quiet: duration(45_000), maxWait: duration(1_200_000) };
    assert.deepEqual(beatsUnder(smart), ['follow', 'follow', 'turnEnded', 'unfollow', 'unfollow', 'follow', 'unfollow', 'follow', 'follow']);
    assert.deepEqual(beatsUnder(PACING_TURN), ['follow', 'follow', 'unfollow', 'unfollow', 'follow', 'unfollow', 'follow', 'follow']);
});

test('a turn end on a tab with a blocked lane tells the engine a session needs the user; otherwise it says none', () => {
    const told: string[] = [];
    const fake = createFakeEngine();
    const engine = { ...fake, turnEnded: (...args: Parameters<typeof fake.turnEnded>): void => { told.push(args[3] ?? 'unset'); } };
    const recaps = tabRecaps(engine);
    recaps.turnEnded(tabId(TAB), lanes, 'turn-ended');
    recaps.turnEnded(tabId(TAB), [{ ...first, status: 'blocked' }, ...lanes.slice(1)], 'turn-ended');
    assert.deepEqual(told, ['none', 'needs-you']);
});
