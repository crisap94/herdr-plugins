import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenTranscripts } from '#src/adapters/screen-transcripts.ts';
import { Dispatch } from '#src/recap/application/dispatch.ts';
import type { LivePromptSource } from '#src/recap/application/dispatch.ts';
import { LivePrompts } from '#src/recap/application/live-prompts.ts';
import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane, SeenLane } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Columns } from '#src/ports/columns.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { TabView, TabViews } from '#src/ports/tab-views.ts';
import type { Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';

const lane = (pane: string, agent = 'claude'): Lane => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent, session: `s-${pane}` });

function reader(agent: string, prompts: Record<string, PromptResult>): { transcripts: Transcripts; asked: { source: string; budget: number }[] } {
    const asked: { source: string; budget: number }[] = [];
    const transcripts: Transcripts = {
        agent,
        locate: (found: Lane): Promise<Located> => Promise.resolve(found.pane === 'w9:p9' ? unknown({ why: 'not-found', what: 'it' }) : { kind: 'located', source: `/t/${found.pane}` }),
        read: () => Promise.reject(new Error('the live prompt never reads a chunk')),
        latestPrompt: (source, budget) => { asked.push({ source, budget }); return Promise.resolve(prompts[source] ?? { kind: 'prompt', text: null }); },
    };
    return { transcripts, asked };
}

test('LivePrompts: the newest prompt of a lane, true only when it changed; a bounded tail is asked for', async () => {
    const { transcripts, asked } = reader('claude', { '/t/w1:p1': { kind: 'prompt', text: 'fix the build' } });
    const prompts = new LivePrompts([transcripts]);
    assert.equal(prompts.of('w1:p1'), null);
    assert.equal(await prompts.refresh(lane('w1:p1')), true);
    assert.equal(prompts.of('w1:p1'), 'fix the build');
    assert.equal(await prompts.refresh(lane('w1:p1')), false, 'the same prompt again is no change');
    assert.ok(asked.every((call) => call.budget > 0 && call.budget <= 1 << 20), 'a bounded tail');
});

test('LivePrompts: a lane that cannot be read, has no prompt or no reader keeps what it had', async () => {
    const { transcripts } = reader('claude', { '/t/w1:p1': { kind: 'prompt', text: 'kept' }, '/t/w1:p2': unknown({ why: 'unreadable', detail: 'x' }) });
    const prompts = new LivePrompts([transcripts]);
    await prompts.refresh(lane('w1:p1'));
    assert.equal(await prompts.refresh(laneFrom({ paneId: 'w9:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' })), false, 'cannot locate');
    assert.equal(await prompts.refresh(lane('w1:p2')), false, 'unreadable');
    assert.equal(prompts.of('w1:p2'), null);
    assert.equal(await prompts.refresh(lane('w1:p3')), false, 'no prompt in the tail');
    assert.equal(await prompts.refresh(lane('w1:p1', 'unheard-of')), false, 'no reader for this agent');
    assert.equal(prompts.of('w1:p1'), 'kept');
});

test('LivePrompts: an agent without a store of its own goes through the any-agent reader, a screen yields none', async () => {
    const screens = { readScreen: (): Promise<never> => Promise.reject(new Error('never')) };
    const prompts = new LivePrompts([new ScreenTranscripts(screens, () => true)]);
    assert.equal(await prompts.refresh(lane('w1:p1', 'gemini')), false);
    assert.equal(prompts.of('w1:p1'), null);
});

test('LivePrompts: a changed prompt replaces the old one; the table stays bounded', async () => {
    const answers: Record<string, PromptResult> = { '/t/w1:p1': { kind: 'prompt', text: 'one' } };
    const { transcripts } = reader('claude', answers);
    const prompts = new LivePrompts([transcripts]);
    await prompts.refresh(lane('w1:p1'));
    answers['/t/w1:p1'] = { kind: 'prompt', text: 'two' };
    assert.equal(await prompts.refresh(lane('w1:p1')), true);
    assert.equal(prompts.of('w1:p1'), 'two');
    for (let at = 0; at < 300; at += 1) {
        answers[`/t/p${at}`] = { kind: 'prompt', text: `prompt ${at}` };
        await prompts.refresh(lane(`p${at}`));
    }
    assert.equal(prompts.of('p299'), 'prompt 299');
    assert.equal(prompts.of('w1:p1'), null, 'the oldest were forgotten');
});

const seenLane = (pane: string, status = 'idle'): SeenLane => ({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status, session: `s-${pane}` });

function play(observations: readonly Observation[]): Intent[][] {
    let board = emptyBoard();
    return observations.map((observation, at) => {
        const outcome = observe(board, observation, instant(at * 1000), DEFAULT_POLICY);
        board = outcome.board;
        return [...outcome.intents];
    });
}

const reads = (intents: readonly Intent[]): string[] => intents.flatMap((intent) => (intent.kind === 'read-prompt' ? [`${String(intent.lane.pane)}:${intent.lane.status}`] : []));
const reconciled = (...lanes: SeenLane[]): Observation => ({ kind: 'reconciled', seen: { focusedTab: null, lanes, panes: lanes.map((l) => l.paneId), columns: [], widths: new Map() } });

test('fold: a status change reads the prompt of that lane (with its new status), right after publishing; no change, no read', () => {
    const steps = play([
        reconciled(seenLane('w1:p1', 'idle')),
        { kind: 'status', pane: paneId('w1:p1'), status: 'working' },
        { kind: 'status', pane: paneId('w1:p1'), status: 'working' },
        { kind: 'status', pane: paneId('w1:p1'), status: 'idle' },
        { kind: 'status', pane: paneId('w1:p7'), status: 'working' },
    ]);
    assert.deepEqual(reads(steps[1] ?? []), ['w1:p1:working']);
    const kinds = (steps[1] ?? []).map((intent) => intent.kind);
    assert.ok(kinds.indexOf('publish') < kinds.indexOf('read-prompt'));
    assert.deepEqual(reads(steps[2] ?? []), []);
    assert.deepEqual(reads(steps[3] ?? []), ['w1:p1:idle']);
    assert.deepEqual(reads(steps[4] ?? []), [], 'a pane that is not a lane');
});

test('fold: a new lane (detected, or first seen in a reconciliation) reads its prompt once; a lane already on the board does not', () => {
    const steps = play([
        reconciled(seenLane('w1:p1')),
        reconciled(seenLane('w1:p1'), seenLane('w1:p2')),
        { kind: 'detected', lane: seenLane('w1:p3') },
        { kind: 'detected', lane: seenLane('w1:p3') },
    ]);
    assert.deepEqual(reads(steps[0] ?? []), ['w1:p1:idle']);
    assert.deepEqual(reads(steps[1] ?? []), ['w1:p2:idle']);
    assert.deepEqual(reads(steps[2] ?? []), ['w1:p3:idle']);
    assert.deepEqual(reads(steps[3] ?? []), []);
});

function dispatchWith(prompts: LivePromptSource): { dispatch: Dispatch; written: TabView[] } {
    const written: TabView[] = [];
    const views = { writeTab: (view: TabView): void => { written.push(view); } } as unknown as TabViews;
    const board = observe(emptyBoard(), reconciled(seenLane('w1:p1')), instant(0), DEFAULT_POLICY).board;
    const dispatch = new Dispatch({
        columns: {} as Columns, views, visibility: {} as ColumnVisibility, recaps: {} as RecapJob, prompts, webs: { of: (): null => null, refresh: (): Promise<boolean> => Promise.resolve(false) }, log: (): void => undefined,
        board: (): Board => board, sizing: (): Sizing => ({ fraction: 0.3, minCols: 36, maxCols: 64 }), feedback: (): void => undefined,
    });
    return { dispatch, written };
}

test('dispatch: read-prompt republishes the tab view with the live prompt only when it changed; a plain publish carries what is known', async () => {
    const known = new Map<string, string>();
    let changes = true;
    const prompts: LivePromptSource = {
        of: (pane) => known.get(pane) ?? null,
        refresh: () => { known.set('w1:p1', 'ship it'); return Promise.resolve(changes); },
    };
    const { dispatch, written } = dispatchWith(prompts);
    const found = lane('w1:p1');
    await dispatch.send({ kind: 'read-prompt', lane: found });
    assert.equal(written.length, 1);
    assert.equal(written[0]?.lanes[0]?.lastPrompt, 'ship it');
    changes = false;
    await dispatch.send({ kind: 'read-prompt', lane: found });
    assert.equal(written.length, 1, 'unchanged: nothing written');
    await dispatch.send({ kind: 'publish', tab: tabId('w1:t1') });
    assert.equal(written.at(-1)?.lanes[0]?.lastPrompt, 'ship it');
});
