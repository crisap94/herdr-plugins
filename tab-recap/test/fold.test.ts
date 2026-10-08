import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Observation, Outcome, SeenColumn } from '#src/recap/domain/fold.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';

const lane = (pane: string, tab: string, status = 'idle', agent = 'claude'): SeenLane =>
    ({ paneId: pane, tabId: tab, workspaceId: 'w1', agent, status, session: `s-${pane}` });

function run(observations: readonly Observation[], start: Board = emptyBoard()): { board: Board; intents: Intent[]; outcomes: Outcome[] } {
    let board = start;
    const intents: Intent[] = [];
    const outcomes: Outcome[] = [];
    observations.forEach((observation, at) => {
        const outcome = observe(board, observation, instant(at * 1000), DEFAULT_POLICY);
        board = outcome.board;
        intents.push(...outcome.intents);
        outcomes.push(outcome);
    });
    return { board, intents, outcomes };
}

const kinds = (intents: readonly Intent[]): string[] => intents.map((intent) => intent.kind);
const seen = (lanes: readonly SeenLane[], columns: SeenColumn[] = [], panes: string[] = []): Observation =>
    ({ kind: 'reconciled', seen: { lanes, columns, panes: [...lanes.map((l) => l.paneId), ...panes], widths: new Map() } });

test('a new agent pops its column up at once', () => {
    const { intents, outcomes } = run([seen([]), { kind: 'detected', lane: lane('w1:p1', 'w1:t1') }]);
    assert.deepEqual(kinds(intents), ['publish', 'read-prompt', 'open-column']);
    assert.deepEqual(intents.at(-1), { kind: 'open-column', tab: 'w1:t1', shape: 'side' }, 'width unknown: a side column');
    assert.equal(outcomes[1]?.watchSet, 'changed', 'the new lane joins the watch set');
});

test('one tab, two lanes: one column', () => {
    const { intents } = run([seen([lane('w1:p1', 'w1:t1'), lane('w1:p2', 'w1:t1')])]);
    assert.equal(kinds(intents).filter((kind) => kind === 'open-column').length, 1);
});

test('a column is not asked for twice while it is opening', () => {
    const { intents } = run([seen([lane('w1:p1', 'w1:t1')]), seen([lane('w1:p1', 'w1:t1')])]);
    assert.equal(kinds(intents).filter((kind) => kind === 'open-column').length, 1);
});

test('a turn ends on working → idle, and only then', () => {
    const { intents } = run([
        seen([lane('w1:p1', 'w1:t1', 'idle')]),
        { kind: 'status', pane: paneId('w1:p1'), status: 'working' },
        { kind: 'status', pane: paneId('w1:p1'), status: 'working' },
        { kind: 'status', pane: paneId('w1:p1'), status: 'done' },
    ]);
    const recaps = intents.flatMap((intent) => (intent.kind === 'recap' ? [intent] : []));
    const [only] = recaps;
    assert.equal(recaps.length, 1);
    assert.ok(only !== undefined);
    assert.equal(only.cause, 'turn-ended');
    assert.equal(only.tab, 'w1:t1');
});

test('a turn that ended while we were blind is caught by the next reconcile', () => {
    const { intents } = run([seen([lane('w1:p1', 'w1:t1', 'working')]), seen([lane('w1:p1', 'w1:t1', 'blocked')])]);
    assert.ok(intents.some((intent) => intent.kind === 'recap' && intent.cause === 'turn-ended'));
});

test('agents outside the policy get no column', () => {
    const { intents } = run([seen([lane('w1:p1', 'w1:t1', 'idle', 'pi')])]);
    assert.deepEqual(kinds(intents), []);
});

test('the last lane leaving closes the column', () => {
    const { intents } = run([
        seen([lane('w1:p1', 'w1:t1')]),
        { kind: 'column-opened', tab: tabId('w1:t1'), pane: paneId('w1:p9'), shape: 'side' },
        { kind: 'closed', pane: paneId('w1:p1') },
    ]);
    assert.deepEqual(intents.at(-1), { kind: 'close-column', tab: 'w1:t1', column: 'w1:p9' });
});

const opened = (pane: string): Observation => ({ kind: 'column-opened', tab: tabId('w1:t1'), pane: paneId(pane), shape: 'side' });
const closed = (pane: string): Observation => ({ kind: 'closed', pane: paneId(pane) });

test('a closed column comes back — until the reopen budget is spent', () => {
    const { intents, board } = run([
        seen([lane('w1:p1', 'w1:t1')]),
        opened('w1:p7'), closed('w1:p7'),
        opened('w1:p8'), closed('w1:p8'),
        opened('w1:p9'), closed('w1:p9'),
    ]);
    assert.equal(kinds(intents).filter((kind) => kind === 'open-column').length, 3, 'reopened twice after the first');
    assert.ok(intents.some((intent) => intent.kind === 'give-up'));
    assert.ok(board.givenUp.has(tabId('w1:t1')));
});

test('switching off closes every column and opens none', () => {
    const { intents, board } = run([
        seen([lane('w1:p1', 'w1:t1')]),
        { kind: 'column-opened', tab: tabId('w1:t1'), pane: paneId('w1:p9'), shape: 'side' },
        { kind: 'switched', enabled: false },
    ]);
    assert.deepEqual(intents.at(-1), { kind: 'close-column', tab: 'w1:t1', column: 'w1:p9' });
    assert.ok(board.closing.has(paneId('w1:p9')), 'asked, and not forgotten until herdr lets go of the pane');
});

test('a restarted daemon adopts the columns it finds instead of opening new ones', () => {
    const { intents } = run([seen([lane('w1:p1', 'w1:t1')], [{ tabId: 'w1:t1', paneId: 'w1:p9', shape: 'side' }], ['w1:p9'])]);
    assert.equal(kinds(intents).filter((kind) => kind === 'open-column').length, 0);
});

const narrowTab = (focusedTab: string | null): Observation =>
    ({ kind: 'reconciled', seen: { focusedTab, lanes: [lane('w1:p1', 'w1:t1')], columns: [], panes: ['w1:p1'], widths: new Map([['w1:t1', 60]]) } });

test('a narrow tab (a phone) gets a bar along the bottom instead of a side column', () => {
    assert.deepEqual(run([narrowTab('w1:t1')]).intents.at(-1), { kind: 'open-column', tab: 'w1:t1', shape: 'bar' });
});

test('a narrow tab in the background gets its bar at once: docking one no longer touches focus', () => {
    const background = run([narrowTab('w9:t9')]);
    assert.deepEqual(background.intents.find((intent) => intent.kind === 'open-column'), { kind: 'open-column', tab: 'w1:t1', shape: 'bar' });
    assert.deepEqual(run([narrowTab(null)]).intents.filter((intent) => intent.kind === 'open-column').length, 1, 'with no focused tab known too');
    const later = run([narrowTab('w9:t9'), { kind: 'focused', tab: tabId('w1:t1') }]).intents.filter((intent) => intent.kind === 'open-column');
    assert.equal(later.length, 1, 'focusing it later does not open a second one');
});

test('focusing a tab or pressing r asks for ONE recap of the whole tab', () => {
    const { intents } = run([
        seen([lane('w1:p1', 'w1:t1'), lane('w1:p2', 'w1:t1')]),
        { kind: 'focused', tab: tabId('w1:t1') },
        { kind: 'requested', tab: tabId('w1:t1') },
    ]);
    const recaps = intents.flatMap((intent) => (intent.kind === 'recap' ? [intent] : []));
    assert.deepEqual(recaps.map((intent) => intent.cause), ['focused', 'requested']);
    const [first] = recaps;
    assert.ok(first !== undefined);
    assert.deepEqual(first.lanes.map((l) => l.pane), ['w1:p1', 'w1:p2'], 'every lane of the tab rides along');
});

test('a turn ending in one lane recaps the tab with all its lanes', () => {
    const { intents } = run([
        seen([lane('w1:p1', 'w1:t1', 'working'), lane('w1:p2', 'w1:t1', 'idle'), lane('w1:p3', 'w1:t2', 'working')]),
        { kind: 'status', pane: paneId('w1:p1'), status: 'idle' },
    ]);
    const recaps = intents.flatMap((intent) => (intent.kind === 'recap' ? [intent] : []));
    const [only] = recaps;
    assert.equal(recaps.length, 1);
    assert.ok(only !== undefined);
    assert.equal(only.tab, 'w1:t1');
    assert.deepEqual(only.lanes.map((l) => l.pane), ['w1:p1', 'w1:p2']);
});

test('a staged rollout: only the listed tabs get a column', () => {
    const policy = { ...DEFAULT_POLICY, onlyTabs: ['w1:t2'] };
    const outcome = observe(emptyBoard(), seen([lane('w1:p1', 'w1:t1'), lane('w1:p2', 'w1:t2')]), instant(0), policy);
    assert.deepEqual(outcome.intents.filter((intent) => intent.kind === 'open-column'), [{ kind: 'open-column', tab: 'w1:t2', shape: 'side' }]);
});

const at = (width: number): Observation =>
    ({ kind: 'reconciled', seen: { focusedTab: 'w1:t1', lanes: [lane('w1:p1', 'w1:t1')], columns: [], panes: ['w1:p1', 'w1:p9'], widths: new Map([['w1:t1', width]]) } });

test('a phone attaching swaps the side column for a bar, and back when the desktop returns', () => {
    const { intents } = run([at(189), { kind: 'column-opened', tab: tabId('w1:t1'), pane: paneId('w1:p9'), shape: 'side' }, at(55), closed('w1:p9')]);
    const docking = intents.flatMap((intent) => {
        if (intent.kind === 'open-column') {
            return [`open ${intent.shape}`];
        }
        return intent.kind === 'close-column' ? [`close ${intent.column}`] : [];
    });
    assert.deepEqual(docking, ['open side', 'close w1:p9', 'open bar']);
});

/** The 2026-10-08 14:56Z storm: a client change flips 28 tabs from bar to side. */
const tabs = Array.from({ length: 28 }, (_, i) => i + 1);
const bars = (width: number): Observation => ({
    kind: 'reconciled',
    seen: {
        focusedTab: null, widths: new Map(tabs.map((n) => [`w1:t${n}`, width])),
        lanes: tabs.map((n) => lane(`w1:p${n}`, `w1:t${n}`)),
        columns: tabs.map((n) => ({ tabId: `w1:t${n}`, paneId: `w1:b${n}`, shape: 'bar' as const })),
        panes: tabs.flatMap((n) => [`w1:p${n}`, `w1:b${n}`]),
    },
});
const barsOpened = tabs.map((n): Observation => ({ kind: 'column-opened', tab: tabId(`w1:t${n}`), pane: paneId(`w1:b${n}`), shape: 'bar' }));

function playAt(steps: readonly (readonly [number, Observation])[], start: Board): { board: Board; closes: Intent[]; opens: Intent[]; gaveUp: Intent[]; each: Intent[][] } {
    let board = start;
    const each: Intent[][] = [];
    for (const [seconds, observation] of steps) {
        const outcome = observe(board, observation, instant(seconds * 1000), DEFAULT_POLICY);
        board = outcome.board;
        each.push([...outcome.intents]);
    }
    const all = each.flat();
    return { board, each, closes: all.filter((i) => i.kind === 'close-column'), opens: all.filter((i) => i.kind === 'open-column'), gaveUp: all.filter((i) => i.kind === 'give-up') };
}

test('a close that does not take effect is asked once, opens no second column, and ends in a give-up', () => {
    const ready = run([bars(60), ...barsOpened]).board;
    const flip = playAt([[100, bars(164)], [105, bars(164)], [110, bars(164)]], ready);
    assert.equal(flip.closes.length, 28, 'exactly one close per bar');
    assert.equal(flip.opens.length, 0, 'the bars are still there: no side column beside them');
    assert.equal(flip.board.closing.size, 28);
    const stuck = playAt([[125, bars(164)], [131, bars(164)], [140, bars(164)], [162, bars(164)], [193, bars(164)]], flip.board);
    assert.equal(stuck.each[0]?.filter((i) => i.kind !== 'publish').length, 0, 'inside closeGrace nothing is repeated');
    assert.equal(stuck.opens.length, 0, 'never a second column');
    assert.equal(stuck.gaveUp.length, 28, 'after reopenLimit tries every tab is given up');
    assert.equal(stuck.closes.length, 28 * 2, 'two retries per bar, one per grace period; the third try is the give-up');
    assert.equal(stuck.board.closing.size, 0);
    assert.equal(stuck.board.columns.size, 28, 'each tab keeps its old-shape column');
    const after = playAt([[221, bars(164)], [300, bars(164)]], stuck.board);
    assert.equal(after.each.flat().filter((i) => i.kind !== 'publish').length, 0, 'given up: quiet');
});

test('a close that takes effect: one close and one open per tab, nothing else', () => {
    const ready = run([bars(60), ...barsOpened]).board;
    const flip = playAt([[100, bars(164)]], ready);
    const gone = tabs.map((n): [number, Observation] => [101, { kind: 'closed', pane: paneId(`w1:b${n}`) }]);
    const done = playAt(gone, flip.board);
    assert.equal(flip.closes.length, 28);
    assert.equal(done.closes.length, 0);
    assert.deepEqual(done.opens.map((i) => i.kind === 'open-column' ? i.shape : null), Array.from({ length: 28 }, () => 'side'));
    const settled = playAt([[102, { kind: 'reconciled', seen: { focusedTab: null, widths: new Map(tabs.map((n) => [`w1:t${n}`, 164])), lanes: tabs.map((n) => lane(`w1:p${n}`, `w1:t${n}`)), columns: [], panes: tabs.map((n) => `w1:p${n}`) } }]], done.board);
    assert.equal(settled.each.flat().filter((i) => i.kind === 'close-column' || i.kind === 'open-column').length, 0, 'the open is still on its way: not asked twice');
});
