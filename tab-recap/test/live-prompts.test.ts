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
import { type SessionKey } from '#src/recap/domain/ids.ts';
import { paneId, tabId, agentKind } from '#test/support/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { FollowedSession, SeenLane } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '@stateforge-labs/session-ledger';
import type { ColumnPanes } from '#src/ports/columns.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { TabViewRecord, TabViewStore } from '#src/ports/tab-views.ts';
import type { Located, PromptResult } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { unknown } from '@stateforge-labs/session-ledger';
import { causeOf } from './fakes/cause.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';
import { sourcePathOf } from '@stateforge-labs/session-ledger';
import { SIZING } from './fakes/layout-values.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { reconciliation, seenLane as laneOf } from '#test/support/seen.ts';

const lane = (pane: string, agent = 'claude'): FollowedSession => laneFrom(laneOf({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent, session: `s-${pane}` }));

function reader(agent: string, prompts: Record<string, PromptResult>): { transcripts: SessionReader; asked: { source: string; budget: number }[] } {
    const asked: { source: string; budget: number }[] = [];
    const transcripts: SessionReader = {
        agent: agentKind(agent),
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
        locate: (found): Promise<Located> => Promise.resolve(found.key === 'w9:p9' ? unknown({ why: 'not-found', what: textOf('it') }) : { kind: 'located', source: sourcePathOf(`/t/${found.key}`) }),
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
    assert.equal(await prompts.refresh(laneFrom(laneOf({ paneId: 'w9:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' }))), 'absent', 'cannot locate');
    assert.equal(await prompts.refresh(lane('w1:p2')), 'absent', 'unreadable');
    assert.equal(prompts.of(paneId('w1:p2')), null);
    assert.equal(await prompts.refresh(lane('w1:p3')), 'absent', 'no prompt in the tail');
    assert.equal(await prompts.refresh(lane('w1:p1', 'unheard-of')), 'absent', 'no reader for this agent');
    assert.equal(prompts.of(paneId('w1:p1')), 'kept');
});

test('LivePrompts: an agent without a store of its own goes through the any-agent reader, a screen yields none', async () => {
    const screens = { readScreen: (): Promise<never> => Promise.reject(new Error('never')) };
    const prompts = new LivePrompts(registryWith({}, new ScreenTranscripts(screens, () => 'present')));
    assert.equal(await prompts.refresh(lane('w1:p1', 'gemini')), 'absent');
    assert.equal(prompts.of(paneId('w1:p1')), null);
});

const seenLane = (pane: string, status = 'idle'): SeenLane => laneOf({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status, session: `s-${pane}` });

const reconciled = (...lanes: SeenLane[]): Observation => ({ kind: 'reconciled', seen: reconciliation({ focusedTab: null, lanes, panes: lanes.map((l) => l.paneId), columns: [], widths: new Map() }) });

function dispatchWith(prompts: PaneSource<Text>): { dispatch: LaneDispatch; written: TabViewRecord[] } {
    const written: TabViewRecord[] = [];
    const views = { writeTab: (view: TabViewRecord): void => { written.push(view); } } as unknown as TabViewStore;
    const board = observe(emptyBoard(), reconciled(seenLane('w1:p1')), instant(0), DEFAULT_POLICY).board;
    const dispatch = new LaneDispatch({
        columns: {} as ColumnPanes, views, visibility: {} as ColumnVisibility, recaps: { turnEnded: (): void => undefined, flush: (): Promise<void> => Promise.resolve() }, prompts, webs: { of: (): null => null, refresh: (): Promise<Presence> => Promise.resolve('absent') }, log: (): void => undefined,
        board: (): Board => board, sizing: (): Sizing => SIZING, feedback: (): void => undefined, ...silentClosures,
    });
    return { dispatch, written };
}

test('dispatch: read-prompt republishes the tab view with the live prompt only when it changed; a plain publish carries what is known', async () => {
    const known = new Map<SessionKey, Text>();
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
