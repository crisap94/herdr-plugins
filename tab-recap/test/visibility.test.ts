import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { reconciliation, seenLane, statusObservation } from '#test/support/seen.ts';

const lane = (pane: string, tab: string): SeenLane => (seenLane({ paneId: pane, tabId: tab, workspaceId: 'w1', agent: 'claude', status: 'idle', session: `s-${pane}` }));
const seen = (lanes: readonly SeenLane[]): Observation => ({
    kind: 'reconciled',
    seen: reconciliation({ focusedTab: null, lanes, widths: new Map(), panes: lanes.map((l) => l.paneId), columns: [] }),
});
const hide = (tab: string): Observation => ({ kind: 'visibility', target: { tab: tabId(tab) }, hidden: true });
const show = (tab: string): Observation => ({ kind: 'visibility', target: { tab: tabId(tab) }, hidden: false });
const toggle = (tab: string): Observation => ({ kind: 'visibility', target: { tab: tabId(tab) }, hidden: 'toggle' });

function play(observations: readonly Observation[], start: Board = emptyBoard()): { board: Board; steps: string[][] } {
    let board = start;
    const steps: string[][] = [];
    observations.forEach((observation, at) => {
        const outcome = observe(board, observation, instant(at * 1000), DEFAULT_POLICY);
        board = outcome.board;
        steps.push(outcome.intents.map(label));
    });
    return { board, steps };
}

function label(intent: Intent): string {
    switch (intent.kind) {
        case 'open-column':
        case 'close-column':
        case 'publish':
        case 'give-up':
        case 'tab-gone':
            return `${intent.kind} ${intent.tab}`;
        case 'lane-closed':
            return `lane-closed ${intent.closed.pane}`;
        case 'recap':
            return `recap ${intent.tab} (${intent.cause})`;
        case 'read-prompt':
            return `read-prompt ${intent.lane.pane}`;
        case 'save-hidden':
            return `save-hidden all=${String(intent.state.all)} hidden=[${intent.state.hidden.join()}] shown=[${intent.state.shown.join()}]`;
        default: {
            const exhaustive: never = intent;
            return String(exhaustive);
        }
    }
}

test('toggle: a toggle after an explicit hide shows, after an explicit show hides — explicit requests keep working', () => {
    const { steps } = play([seen([lane('w1:p1', 'w1:t1')]), hide('w1:t1'), toggle('w1:t1'), show('w1:t1'), toggle('w1:t1'), hide('w1:t1')]);
    assert.ok(steps[2]?.includes('save-hidden all=false hidden=[] shown=[]'), 'hidden, so the toggle shows');
    assert.ok(steps[3]?.includes('save-hidden all=false hidden=[] shown=[]'), 'an explicit show of a shown tab changes nothing');
    assert.ok(steps[4]?.includes('save-hidden all=false hidden=[w1:t1] shown=[]'), 'shown, so the toggle hides');
    assert.ok(steps[5]?.includes('save-hidden all=false hidden=[w1:t1] shown=[]'), 'an explicit hide of a hidden tab changes nothing');
});

test('recaps keep being asked for while the column is hidden', () => {
    const { steps } = play([seen([lane('w1:p1', 'w1:t1')]), hide('w1:t1'), { kind: 'requested', tab: tabId('w1:t1') }, statusObservation({ kind: 'status', pane: paneId('w1:p1'), status: 'working' }), statusObservation({ kind: 'status', pane: paneId('w1:p1'), status: 'idle' })]);
    assert.ok(steps[2]?.includes('recap w1:t1 (requested)'));
    assert.ok(steps[4]?.includes('recap w1:t1 (turn-ended)'));
});
