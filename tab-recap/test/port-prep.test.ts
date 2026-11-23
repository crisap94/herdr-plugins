import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notesByPaneOf } from '#src/extensions/load.ts';
import { en } from '#src/i18n/en.ts';
import { viewOf } from '#src/recap/application/dispatch.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import { paneId as paneOf, tabId } from '#test/support/ids.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import { present } from '#src/recap/render/present.ts';
import type { ExtensionPort, PaneNote, PaneNotesResult } from '#src/ports/extension.ts';
import type { TabLaneRecord } from '#src/ports/tab-views.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { reconciliation, seenLane } from '#test/support/seen.ts';
import { laneRecord, viewRecord } from '#test/support/tab-view-records.ts';

const noGlow = (): null => null;

const seen = (paneId: string, cwd: string | null): SeenLane => (seenLane({ paneId, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle', cwd }));

test('viewOf carries each lane\'s cwd, null when herdr did not say', () => {
    const { board } = observe(emptyBoard(), {
        kind: 'reconciled',
        seen: reconciliation({ focusedTab: 'w1:t1', lanes: [seen('w1:p1', '/w/repo'), seen('w1:p2', null)], columns: [], panes: ['w1:p1', 'w1:p2'], widths: new Map([['w1:t1', 200]]) }),
    }, instant(0), DEFAULT_POLICY);
    assert.deepEqual(viewOf(board, tabId('w1:t1'), instant(5)).lanes.map((lane) => lane.cwd), ['/w/repo', null]);
});

test('viewOf carries each lane\'s since from the board', () => {
    const { board } = observe(emptyBoard(), {
        kind: 'reconciled',
        seen: reconciliation({ focusedTab: 'w1:t1', lanes: [seen('w1:p1', '/w/repo'), seen('w1:p2', null)], columns: [], panes: ['w1:p1', 'w1:p2'], widths: new Map([['w1:t1', 200]]) }),
    }, instant(0), DEFAULT_POLICY);
    assert.deepEqual(viewOf(board, tabId('w1:t1'), instant(5)).lanes.map((lane) => lane.since), [instant(0), instant(0)]);
});

const lane: TabLaneRecord = laneRecord({ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null, cwd: null });
const view = (notes: PaneNote[]): string => present({
    tab: viewRecord({ tab: 'w1:t1', column: null, at: 0, lanes: [lane] }), recap: null, notes: new Map([[paneOf('w1:p1'), notes]]), warnings: [], now: 0, messages: en,
}, 60, noGlow).join('\n');

test('a note wears ⚑ unless it names its own mark', () => {
    assert.match(view([{ label: textOf('plain'), at: null, details: [] }]), /⚑ plain/);
    const own = view([{ label: textOf('branch'), at: null, details: [textOf('main')], mark: textOf('⎇') }]);
    assert.match(own, /⎇ branch · main/);
    assert.doesNotMatch(own, /⚑/);
});

test('notes() may take the lanes and the locale, or nothing: both shapes type-check and are called', () => {
    const received: unknown[] = [];
    const wanting: ExtensionPort = {
        id: textOf('wants'),
        notes: (lanes, locale): PaneNotesResult => { received.push(lanes, locale); return { kind: 'notes', byPane: new Map() }; },
    };
    const bare: ExtensionPort = { id: textOf('bare'), notes: (): PaneNotesResult => ({ kind: 'notes', byPane: new Map([[paneOf('p'), [{ label: textOf('x'), at: null, details: [] }]]]) }) };
    const merged = notesByPaneOf([wanting, bare], [lane], 'es');
    assert.deepEqual(received, [[lane], 'es']);
    assert.equal(merged.get(paneOf('p'))?.length, 1);
    notesByPaneOf([wanting, bare]);
    assert.deepEqual(received.slice(2), [undefined, undefined]);
});
