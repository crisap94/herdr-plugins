import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensions, notesOf } from '#src/extensions/load.ts';
import { en } from '#src/i18n/en.ts';
import { viewOf } from '#src/recap/application/dispatch.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import { present } from '#src/recap/render/present.ts';
import type { Extension, ExtensionFactory, Note, NotesResult } from '#src/ports/extension.ts';
import type { TabLane } from '#src/ports/tab-views.ts';

const noGlow = (): null => null;

const seen = (paneId: string, cwd: string | null): SeenLane => ({ paneId, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle', cwd });

test('viewOf carries each lane\'s cwd, null when herdr did not say', () => {
    const { board } = observe(emptyBoard(), {
        kind: 'reconciled',
        seen: { focusedTab: 'w1:t1', lanes: [seen('w1:p1', '/w/repo'), seen('w1:p2', null)], columns: [], panes: ['w1:p1', 'w1:p2'], widths: new Map([['w1:t1', 200]]) },
    }, instant(0), DEFAULT_POLICY);
    assert.deepEqual(viewOf(board, tabId('w1:t1'), 5).lanes.map((lane) => lane.cwd), ['/w/repo', null]);
});

const lane: TabLane = { pane: 'w1:p1', agent: 'claude', status: 'idle', title: null, cwd: null };
const view = (notes: Note[]): string => present({
    tab: { tab: 'w1:t1', column: null, at: 0, lanes: [lane] }, recap: null, notes: new Map([['w1:p1', notes]]), warnings: [], now: 0, messages: en,
}, 60, noGlow).join('\n');

test('a note wears ⚑ unless it names its own mark', () => {
    assert.match(view([{ label: 'plain', at: null, details: [] }]), /⚑ plain/);
    const own = view([{ label: 'branch', at: null, details: ['main'], mark: '⎇' }]);
    assert.match(own, /⎇ branch · main/);
    assert.doesNotMatch(own, /⚑/);
});

test('notes() may take the lanes and the locale, or nothing: both shapes type-check and are called', () => {
    const received: unknown[] = [];
    const wanting: Extension = {
        id: 'wants',
        notes: (lanes, locale): NotesResult => { received.push(lanes, locale); return { kind: 'notes', byPane: new Map() }; },
    };
    const bare: Extension = { id: 'bare', notes: (): NotesResult => ({ kind: 'notes', byPane: new Map([['p', [{ label: 'x', at: null, details: [] }]]]) }) };
    const merged = notesOf([wanting, bare], [lane], 'es');
    assert.deepEqual(received, [[lane], 'es']);
    assert.equal(merged.get('p')?.length, 1);
    notesOf([wanting, bare]);
    assert.deepEqual(received.slice(2), [undefined, undefined]);
    const factory: ExtensionFactory = () => bare;
    assert.equal(loadExtensions(() => undefined, [factory]).length, 1);
});
