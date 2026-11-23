import { test } from 'node:test';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { silentClosures } from './fakes/silent-closures.ts';
import assert from 'node:assert/strict';
import { ScreenTranscripts } from '#src/adapters/transcripts/screen.ts';
import { LaneDispatch } from '#src/recap/application/dispatch.ts';
import type { PaneSource } from '#src/recap/application/dispatch.ts';
import { LivePrompts } from '#src/recap/application/live-prompts.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { type PaneId } from '#src/recap/domain/ids.ts';
import { paneId, tabId, agentKind } from '#test/support/ids.ts';
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
import { causeOf } from './fakes/cause.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import { sourcePathOf } from '#src/ports/transcripts.ts';
import { SIZING } from './fakes/layout-values.ts';
import type { Presence } from '#src/recap/domain/presence.ts';

const lane = (pane: string, agent = 'claude'): Lane => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent, session: `s-${pane}` });

function reader(agent: string, prompts: Record<string, PromptResult>): { transcripts: Transcripts; asked: { source: string; budget: number }[] } {
    const asked: { source: string; budget: number }[] = [];
    const transcripts: Transcripts = {
        agent: agentKind(agent),
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
        locate: (found: Lane): Promise<Located> => Promise.resolve(found.pane === 'w9:p9' ? unknown({ why: 'not-found', what: textOf('it') }) : { kind: 'located', source: sourcePathOf(`/t/${found.pane}`) }),
        read: () => Promise.reject(new Error('the live prompt never reads a chunk')),
        latestPrompt: (source, budget) => { asked.push({ source, budget }); return Promise.resolve(prompts[source] ?? { kind: 'prompt', text: null }); },
    };
    return { transcripts, asked };
}

test('LivePrompts: the newest prompt of a lane, true only when it changed; a bounded tail is asked for', async () => {
    const { transcripts, asked } = reader('claude', { '/t/w1:p1': { kind: 'prompt', text: textOf('fix the build') } });
    const prompts = new LivePrompts(registryWith({ [transcripts.agent]: transcripts }));
    assert.equal(prompts.of(paneId('w1:p1')), null);
    assert.equal(await prompts.refresh(lane('w1:p1')), 'present');
    assert.equal(prompts.of(paneId('w1:p1')), 'fix the build');
    assert.equal(await prompts.refresh(lane('w1:p1')), 'absent', 'the same prompt again is no change');
    assert.ok(asked.every((call) => call.budget > 0 && call.budget <= 1 << 20), 'a bounded tail');
});

test('LivePrompts: a lane that cannot be read, has no prompt or no reader keeps what it had', async () => {
    const { transcripts } = reader('claude', { '/t/w1:p1': { kind: 'prompt', text: textOf('kept') }, '/t/w1:p2': unknown({ why: 'unreadable', detail: causeOf('x') }) });
    const prompts = new LivePrompts(registryWith({ [transcripts.agent]: transcripts }));
    await prompts.refresh(lane('w1:p1'));
    assert.equal(await prompts.refresh(laneFrom({ paneId: 'w9:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' })), 'absent', 'cannot locate');
    assert.equal(await prompts.refresh(lane('w1:p2')), 'absent', 'unreadable');
    assert.equal(prompts.of(paneId('w1:p2')), null);
    assert.equal(await prompts.refresh(lane('w1:p3')), 'absent', 'no prompt in the tail');
    assert.equal(await prompts.refresh(lane('w1:p1', 'unheard-of')), 'absent', 'no reader for this agent');
    assert.equal(prompts.of(paneId('w1:p1')), 'kept');
});

test('LivePrompts: an agent without a store of its own goes through the any-agent reader, a screen yields none', async () => {
    const screens = { readScreen: (): Promise<never> => Promise.reject(new Error('never')) };
    const prompts = new LivePrompts(registryWith({}, new ScreenTranscripts(screens, () => true)));
    assert.equal(await prompts.refresh(lane('w1:p1', 'gemini')), 'absent');
    assert.equal(prompts.of(paneId('w1:p1')), null);
});

test('LivePrompts: a changed prompt replaces the old one; the table stays bounded', async () => {
    const answers: Record<string, PromptResult> = { '/t/w1:p1': { kind: 'prompt', text: textOf('one') } };
    const { transcripts } = reader('claude', answers);
    const prompts = new LivePrompts(registryWith({ [transcripts.agent]: transcripts }));
    await prompts.refresh(lane('w1:p1'));
    answers['/t/w1:p1'] = { kind: 'prompt', text: textOf('two') };
    assert.equal(await prompts.refresh(lane('w1:p1')), 'present');
    assert.equal(prompts.of(paneId('w1:p1')), 'two');
    for (let at = 0; at < 300; at += 1) {
        answers[`/t/p${at}`] = { kind: 'prompt', text: textOf(`prompt ${at}`) };
        await prompts.refresh(lane(`p${at}`));
    }
    assert.equal(prompts.of(paneId('p299')), 'prompt 299');
    assert.equal(prompts.of(paneId('w1:p1')), null, 'the oldest were forgotten');
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

function dispatchWith(prompts: PaneSource<Text>): { dispatch: LaneDispatch; written: TabView[] } {
    const written: TabView[] = [];
    const views = { writeTab: (view: TabView): void => { written.push(view); } } as unknown as TabViews;
    const board = observe(emptyBoard(), reconciled(seenLane('w1:p1')), instant(0), DEFAULT_POLICY).board;
    const dispatch = new LaneDispatch({
        columns: {} as Columns, views, visibility: {} as ColumnVisibility, recaps: { turnEnded: (): void => undefined, flush: (): Promise<void> => Promise.resolve() }, prompts, webs: { of: (): null => null, refresh: (): Promise<Presence> => Promise.resolve('absent') }, log: (): void => undefined,
        board: (): Board => board, sizing: (): Sizing => SIZING, feedback: (): void => undefined, ...silentClosures,
    });
    return { dispatch, written };
}

test('dispatch: read-prompt republishes the tab view with the live prompt only when it changed; a plain publish carries what is known', async () => {
    const known = new Map<PaneId, Text>();
    let changes = true;
    const prompts: PaneSource<Text> = {
        of: (pane) => known.get(pane) ?? null,
        refresh: () => { known.set(paneId('w1:p1'), textOf('ship it')); return Promise.resolve(changes ? 'present' : 'absent'); },
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
