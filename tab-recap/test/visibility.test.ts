import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board, HiddenState } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import { hiddenState, restoreHidden } from '#src/recap/domain/visibility.ts';

const lane = (pane: string, tab: string): SeenLane => ({ paneId: pane, tabId: tab, workspaceId: 'w1', agent: 'claude', status: 'idle', session: `s-${pane}` });
const seen = (lanes: readonly SeenLane[], columns: { tab: string; pane: string }[] = []): Observation => ({
    kind: 'reconciled',
    seen: {
        focusedTab: null, lanes, widths: new Map(),
        panes: [...lanes.map((l) => l.paneId), ...columns.map((c) => c.pane)],
        columns: columns.map((c) => ({ tabId: c.tab, paneId: c.pane, shape: 'side' as const })),
    },
});
const opened = (tab: string, pane: string): Observation => ({ kind: 'column-opened', tab: tabId(tab), pane: paneId(pane), shape: 'side' });
const gone = (pane: string): Observation => ({ kind: 'closed', pane: paneId(pane) });
const hide = (tab: string): Observation => ({ kind: 'visibility', target: { tab: tabId(tab) }, hidden: true });
const show = (tab: string): Observation => ({ kind: 'visibility', target: { tab: tabId(tab) }, hidden: false });
const toggle = (tab: string): Observation => ({ kind: 'visibility', target: { tab: tabId(tab) }, hidden: 'toggle' });
const toggleAll: Observation = { kind: 'visibility', target: 'all', hidden: 'toggle' };
const hideAll: Observation = { kind: 'visibility', target: 'all', hidden: true };
const showAll: Observation = { kind: 'visibility', target: 'all', hidden: false };

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
            return `${intent.kind} ${intent.tab}`;
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

test('hide closes the column and remembers it; show brings it back', () => {
    const { steps } = play([seen([lane('w1:p1', 'w1:t1')]), opened('w1:t1', 'w1:p9'), hide('w1:t1'), show('w1:t1'), gone('w1:p9')]);
    assert.deepEqual(steps[2], ['save-hidden all=false hidden=[w1:t1] shown=[]', 'close-column w1:t1']);
    assert.deepEqual(steps[3], ['save-hidden all=false hidden=[] shown=[]'], 'the old column is still there: no second one');
    assert.deepEqual(steps[4], ['open-column w1:t1']);
});

test('a hidden tab does not spend the reopen budget: the column we closed going away is not "someone closed it"', () => {
    const closing: Observation[] = [];
    for (let at = 0; at < 6; at += 1) {
        closing.push({ kind: 'closed', pane: paneId('w1:p9') });
    }
    const { board, steps } = play([seen([lane('w1:p1', 'w1:t1')]), opened('w1:t1', 'w1:p9'), hide('w1:t1'), ...closing]);
    assert.equal(board.reopens.size, 0);
    assert.equal(board.givenUp.size, 0);
    assert.ok(steps.slice(3).flat().every((entry) => !entry.startsWith('give-up') && !entry.startsWith('open-column')), 'nothing after the hide');
});

test('a hidden tab ignores reconciliation: a column found there is closed, none is opened', () => {
    const { steps } = play([seen([lane('w1:p1', 'w1:t1')]), opened('w1:t1', 'w1:p9'), hide('w1:t1'), seen([lane('w1:p1', 'w1:t1')], [{ tab: 'w1:t1', pane: 'w1:p8' }])]);
    assert.ok(steps[3]?.includes('close-column w1:t1'));
    assert.ok(steps[3]?.every((entry) => !entry.startsWith('open-column')));
});

test('recaps keep being asked for while the column is hidden', () => {
    const { steps } = play([seen([lane('w1:p1', 'w1:t1')]), hide('w1:t1'), { kind: 'requested', tab: tabId('w1:t1') }, { kind: 'status', pane: paneId('w1:p1'), status: 'working' }, { kind: 'status', pane: paneId('w1:p1'), status: 'idle' }]);
    assert.ok(steps[2]?.includes('recap w1:t1 (requested)'));
    assert.ok(steps[4]?.includes('recap w1:t1 (turn-ended)'));
});

test('all hidden, then show one: only that tab gets its column; a tab that appears later stays hidden', () => {
    const { board, steps } = play([
        seen([lane('w1:p1', 'w1:t1'), lane('w1:p2', 'w1:t2')]), opened('w1:t1', 'w1:p8'), opened('w1:t2', 'w1:p9'),
        hideAll, gone('w1:p8'), gone('w1:p9'),
        { kind: 'detected', lane: lane('w1:p3', 'w1:t3') },
        show('w1:t2'),
        showAll,
    ]);
    assert.deepEqual(steps[3], ['save-hidden all=true hidden=[] shown=[]', 'close-column w1:t1', 'close-column w1:t2']);
    assert.ok(steps[6]?.every((entry) => !entry.startsWith('open-column')), 'a new tab under the blanket stays hidden');
    assert.deepEqual(steps[7], ['save-hidden all=true hidden=[] shown=[w1:t2]', 'open-column w1:t2']);
    assert.deepEqual(steps[8]?.filter((entry) => entry.startsWith('open-column')).toSorted(), ['open-column w1:t1', 'open-column w1:t3']);
    assert.equal(board.allHidden, false);
});

test('with the blanket on, hiding a tab again takes it out of the shown ones', () => {
    const { steps } = play([seen([lane('w1:p1', 'w1:t1')]), hideAll, show('w1:t1'), hide('w1:t1')]);
    assert.deepEqual(steps[3], ['save-hidden all=true hidden=[] shown=[]']);
});

test('what was saved comes back at start: the hidden tab is not opened by the first reconcile', () => {
    const state: HiddenState = { all: false, hidden: ['w1:t1'], shown: [] };
    const { steps } = play([{ kind: 'hidden-restored', state }, seen([lane('w1:p1', 'w1:t1'), lane('w1:p2', 'w1:t2')])]);
    assert.deepEqual(steps[0], []);
    assert.deepEqual(steps[1]?.filter((entry) => entry.startsWith('open-column')), ['open-column w1:t2']);
});

test('showing a tab again forgets its give-up: the operator\'s word beats the daemon\'s', () => {
    const failing: Observation[] = ['a', 'b', 'c'].map(() => ({ kind: 'column-failed', tab: tabId('w1:t1') }));
    const given = play([seen([lane('w1:p1', 'w1:t1')]), ...failing]);
    assert.equal(given.board.givenUp.size, 1);
    const { steps } = play([hide('w1:t1'), show('w1:t1')], given.board);
    assert.ok(steps[1]?.includes('open-column w1:t1'));
});

test('hiddenState / restoreHidden round-trip', () => {
    const board = play([seen([]), hide('w1:t2'), hide('w1:t1')]).board;
    const state = hiddenState(board);
    assert.deepEqual(state, { all: false, hidden: ['w1:t1', 'w1:t2'], shown: [] });
    assert.deepEqual(hiddenState(restoreHidden(emptyBoard(), state)), state);
});

test('toggle: two in a row return to the start — the daemon flips what the board holds, however fast they come', () => {
    const { board, steps } = play([seen([lane('w1:p1', 'w1:t1')]), opened('w1:t1', 'w1:p9'), toggle('w1:t1'), toggle('w1:t1'), gone('w1:p9')]);
    assert.deepEqual(steps[2], ['save-hidden all=false hidden=[w1:t1] shown=[]', 'close-column w1:t1']);
    assert.deepEqual(steps[3], ['save-hidden all=false hidden=[] shown=[]']);
    assert.deepEqual(steps[4], ['open-column w1:t1']);
    assert.equal(board.hidden.size, 0);
    const odd = play([seen([lane('w1:p1', 'w1:t1')]), toggle('w1:t1'), toggle('w1:t1'), toggle('w1:t1')]);
    assert.deepEqual([...odd.board.hidden], ['w1:t1'], 'three toggles = hidden');
});

test('toggle: a toggle after an explicit hide shows, after an explicit show hides — explicit requests keep working', () => {
    const { steps } = play([seen([lane('w1:p1', 'w1:t1')]), hide('w1:t1'), toggle('w1:t1'), show('w1:t1'), toggle('w1:t1'), hide('w1:t1')]);
    assert.ok(steps[2]?.includes('save-hidden all=false hidden=[] shown=[]'), 'hidden, so the toggle shows');
    assert.ok(steps[3]?.includes('save-hidden all=false hidden=[] shown=[]'), 'an explicit show of a shown tab changes nothing');
    assert.ok(steps[4]?.includes('save-hidden all=false hidden=[w1:t1] shown=[]'), 'shown, so the toggle hides');
    assert.ok(steps[5]?.includes('save-hidden all=false hidden=[w1:t1] shown=[]'), 'an explicit hide of a hidden tab changes nothing');
});

test('toggle all, then toggle a tab: everything hides, then that one tab comes back; toggle all again shows everything', () => {
    const { board, steps } = play([
        seen([lane('w1:p1', 'w1:t1'), lane('w1:p2', 'w1:t2')]), opened('w1:t1', 'w1:p8'), opened('w1:t2', 'w1:p9'),
        toggleAll, gone('w1:p8'), gone('w1:p9'), toggle('w1:t2'), opened('w1:t2', 'w1:p7'), toggle('w1:t2'), gone('w1:p7'), toggleAll,
    ]);
    assert.deepEqual(steps[3], ['save-hidden all=true hidden=[] shown=[]', 'close-column w1:t1', 'close-column w1:t2']);
    assert.deepEqual(steps[6], ['save-hidden all=true hidden=[] shown=[w1:t2]', 'open-column w1:t2']);
    assert.deepEqual(steps[8], ['save-hidden all=true hidden=[] shown=[]', 'close-column w1:t2'], 'toggled again: hidden under the blanket');
    assert.deepEqual(steps[10]?.filter((entry) => entry.startsWith('open-column')).toSorted(), ['open-column w1:t1', 'open-column w1:t2']);
    assert.equal(board.allHidden, false);
    const twice = play([seen([lane('w1:p1', 'w1:t1')]), toggleAll, toggleAll]);
    assert.equal(twice.board.allHidden, false, 'two toggle-alls return to the start');
});

