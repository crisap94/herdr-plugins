import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Store } from '#src/adapters/db/database.ts';
import { reconciliationOf } from '#src/adapters/herdr/json.ts';
import { Dispatch } from '#src/recap/application/dispatch.ts';
import type { Engine } from '#src/recap/application/engine.ts';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane, SeenLane } from '#src/recap/domain/lane.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Columns } from '#src/ports/columns.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import type { TabViews } from '#src/ports/tab-views.ts';
import type { ChunkResult, Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { memoryStore } from '#test/db/support.ts';
import { closedDaysOf } from '#test/fakes/closed-days.ts';
import { silentClosures } from '#test/fakes/silent-closures.ts';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { NO_REPOS } from '#test/support.ts';

const said: Record<string, string> = { old: 'migrate victoria', new: 'write the docs' };

const transcripts: Transcripts = {
    agent: 'claude',
    inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
    locate: (lane: Lane): Promise<Located> => Promise.resolve({ kind: 'located', source: `/t/${String(lane.session)}` }),
    latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
    read: (source: string): Promise<ChunkResult> => {
        const text = said[source.slice(3)] ?? '';
        return Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text }], title: null, lastPrompt: text, claudeRecap: null, notes: [], position: { cursor: 100, tail: null }, grew: true });
    },
};

const add = (section: string, text: string, anchor: string): Record<string, unknown> => ({ op: 'add', section, text, anchor });

async function recapOnce(store: Store, lane: Lane, at: number, ops: readonly Record<string, unknown>[]): Promise<readonly RecapRequest[]> {
    const requests: RecapRequest[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => { requests.push(request); return Promise.resolve({ kind: 'written', text: JSON.stringify({ ops }), costUsd: 0 }); },
    };
    const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), repos: NO_REPOS, transcripts: registryWith({ claude: transcripts }),
        records: store.records, ledger: store.ledger, clock: { now: (): ReturnType<typeof instant> => instant(at) }, summarizer: (): Summarizer => summarizer, language: (): string => 'en', log: (): void => undefined,
    });
    await job.refreshNow(lane.tab, [lane]);
    return requests;
}

const seenLane = (pane: string, tab: string, session: string): SeenLane => ({ paneId: pane, tabId: tab, workspaceId: tab.split(':')[0] ?? '', agent: 'claude', status: 'idle', session });

const reconciled = (lanes: readonly SeenLane[], listed: readonly string[] | undefined): Observation =>
    ({ kind: 'reconciled', seen: { lanes, columns: [], panes: lanes.map((lane) => lane.paneId), widths: new Map(), ...(listed === undefined ? {} : { tabs: listed.map((tab) => tabId(tab)) }) } });

function folded(observations: readonly Observation[]): { readonly board: Board; readonly last: readonly Intent[] } {
    let board = emptyBoard();
    let last: readonly Intent[] = [];
    observations.forEach((observation, index) => {
        const outcome = observe(board, observation, instant((index + 1) * 1000), DEFAULT_POLICY);
        board = outcome.board;
        last = outcome.intents;
    });
    return { board, last };
}

async function dispatched(store: Store, intents: readonly Intent[]): Promise<readonly string[]> {
    const lines: string[] = [];
    const dispatch = new Dispatch({
        columns: {} as Columns, views: {} as TabViews, visibility: {} as ColumnVisibility, recaps: {} as Pick<Engine, 'turnEnded'>,
        prompts: { of: (): null => null, refresh: (): Promise<boolean> => Promise.resolve(false) }, webs: { of: (): null => null, refresh: (): Promise<boolean> => Promise.resolve(false) },
        log: (line): void => { lines.push(String(line)); }, board: (): Board => emptyBoard(), sizing: (): Sizing => ({ fraction: 0.3, minCols: 36, maxCols: 64 }), feedback: (): void => undefined,
        ...silentClosures, closures: store.closedLanes, closedDays: (): ClosedLaneDays => closedDaysOf('14'), retirements: store.retention,
    });
    for (const intent of intents.filter((each) => each.kind === 'lane-closed' || each.kind === 'tab-gone')) {
        await dispatch.send(intent);
    }
    return lines;
}

const OLD_FACTS = [add('goal', 'old payments work', 'migrate victoria'), add('now', 'migrating victoria', 'migrate victoria')];
const NEW_FACTS = [add('goal', 'new docs work', 'write the docs')];
const texts = (store: Store, tab: string, key: string): readonly string[] => store.ledger.allOf({ tab, key }).map((fact) => `${fact.state}:${fact.text}`);

test('tab reuse: a tab id herdr hands to a new tab after its workspace closed starts from an empty ledger, and the old facts are kept apart', async () => {
    const store = memoryStore();
    const tab = 'w2G:t1';
    await recapOnce(store, laneFrom(seenLane('w2G:p1', tab, 'old')), 500, OLD_FACTS);
    assert.deepEqual(texts(store, tab, 't1'), ['open:old payments work', 'open:migrating victoria']);
    const { last } = folded([reconciled([seenLane('w2G:p1', tab, 'old')], [tab]), reconciled([], [])]);
    assert.deepEqual(last.filter((intent) => intent.kind === 'tab-gone'), [{ kind: 'tab-gone', tab: tabId(tab), at: instant(2000) }], 'the tab is gone from the snapshot');
    assert.deepEqual(await dispatched(store, last), ['tab w2G:t1: gone from herdr, its tasks are retired']);
    const requests = await recapOnce(store, laneFrom(seenLane('w2G:p1', tab, 'new')), 3000, NEW_FACTS);
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0]?.input.ledgers.flatMap((ledger) => ledger.facts), [], 'the writer is handed no fact of the old tab');
    assert.ok(!JSON.stringify(requests[0]).includes('old payments work'), 'no old fact text reaches the writer');
    assert.deepEqual(store.records.readRecap(tab)?.tasks.map((task) => [task.id, task.sections?.goal]), [['t2', 'new docs work']], 'the new tab is a task of its own');
    assert.deepEqual(texts(store, tab, 't1'), ['open:old payments work', 'open:migrating victoria'], 'the old facts are kept, nothing is deleted');
    assert.deepEqual(store.ledger.historyOf(tab, 'w2G:p1').map((fact) => fact.text), ['new docs work'], 'a compaction brief of the new tab reads only its own facts');
    const closures = store.closedLanes.listOf(tabId(tab), instant(4000));
    assert.deepEqual(closures.kind === 'listed' ? closures.records : closures, [], 'the old tab\'s closed lane is not shown in the new tab');
});

test('tab reuse: an agent restarted in a tab that is still open keeps its ledger', async () => {
    const store = memoryStore();
    const tab = 'w1:t1';
    await recapOnce(store, laneFrom(seenLane('w1:p1', tab, 'old')), 500, OLD_FACTS);
    const { last } = folded([reconciled([seenLane('w1:p1', tab, 'old')], [tab]), reconciled([], [tab])]);
    assert.deepEqual(last.filter((intent) => intent.kind === 'tab-gone'), [], 'a tab still in the snapshot is not gone');
    assert.deepEqual(await dispatched(store, last), []);
    const requests = await recapOnce(store, laneFrom(seenLane('w1:p1', tab, 'new')), 3000, NEW_FACTS);
    assert.deepEqual(requests[0]?.input.ledgers.flatMap((ledger) => ledger.facts.map((fact) => fact.text)), ['old payments work', 'migrating victoria'], 'the writer continues the old ledger');
    assert.deepEqual(store.records.readRecap(tab)?.tasks.map((task) => task.id), ['t1']);
});

test('tab reuse: a retirement is written once, and a tab with nothing written is left alone', async () => {
    const store = memoryStore();
    assert.equal(store.retention.retire(tabId('w9:t1'), instant(10)), 'nothing', 'an unknown tab');
    await recapOnce(store, laneFrom(seenLane('w2G:p1', 'w2G:t1', 'old')), 500, OLD_FACTS);
    assert.equal(store.retention.retire(tabId('w2G:t1'), instant(2000)), 'retired');
    assert.equal(store.retention.retire(tabId('w2G:t1'), instant(2500)), 'nothing', 'already retired, nothing written since');
});

test('tab reuse: a snapshot without a tab list retires nothing, one with it names every tab', () => {
    assert.equal(reconciliationOf({ panes: [], agents: [], layouts: [] }).tabs, undefined);
    assert.deepEqual(reconciliationOf({ panes: [], agents: [], layouts: [], tabs: [{ tab_id: 'w1:t1' }, { tab_id: 'w2:t1' }, {}] }).tabs, ['w1:t1', 'w2:t1']);
    const { last } = folded([reconciled([seenLane('w1:p1', 'w1:t1', 'old')], undefined), reconciled([], undefined)]);
    assert.deepEqual(last.filter((intent) => intent.kind === 'tab-gone'), []);
});
