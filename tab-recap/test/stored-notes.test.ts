import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitNoteOf, storedNotes, STORED_NOTES_ID } from '#src/extensions/stored-notes.ts';
import { FACTORIES } from '#src/extensions/index.ts';
import { loadExtensions } from '#src/extensions/load.ts';
import type { ExtensionFactory, ExtensionStore, NotesResult } from '#src/ports/extension.ts';
import type { PaneAlertReader } from '#src/ports/pane-alerts.ts';
import { parseAlertSource } from '#src/recap/domain/pane-alert.ts';
import type { PaneAlert } from '#src/recap/domain/pane-alert.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { TabLane } from '#src/ports/tab-views.ts';
import type { PaneNoteReader, WorktreeStatusReader } from '#src/ports/worktree-status.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { WorktreeStatus, WorktreeSwitch } from '#src/recap/domain/worktree.ts';

const count = (n: number): Count => must(parseCount(n));
const status = (ahead: number | null, tracked: number, untracked: number | null): WorktreeStatus => ({
    root: must(parseDirectory('/w/repo')), branch: must(parseText('main')), ahead: ahead === null ? null : count(ahead), tracked: count(tracked), untracked: untracked === null ? null : count(untracked), at: instant(1),
});
const lane = (pane: string): TabLane => ({ pane, agent: 'claude', status: 'idle', title: null, cwd: '/w/repo' });
const labels = (result: NotesResult): [string, string][] =>
    result.kind === 'notes' ? [...result.byPane].map(([pane, notes]) => [pane, notes.map((note) => `${note.mark ?? '⚑'} ${note.label} ${note.details.join('|')}`).join(' ; ')]) : [];

test('gitNoteOf: ⎇, en and es; clean and not ahead is just the branch; changed counts tracked and untracked', () => {
    assert.deepEqual(gitNoteOf(status(2, 1, 0), 'en'), { label: 'main', at: null, details: ['2 unpushed', '1 changed'], mark: '⎇' });
    assert.deepEqual(gitNoteOf(status(2, 1, 2), 'es').details, ['2 sin subir', '3 cambiados']);
    assert.deepEqual(gitNoteOf(status(2, 1, null), 'es').details, ['2 sin subir', '1 cambiado']);
    assert.deepEqual(gitNoteOf(status(0, 0, 0), 'en').details, []);
    assert.deepEqual(gitNoteOf(status(null, 0, null), 'en').details, []);
});

const alertAt = (pane: string, label: string, at: number, details: string[]): PaneAlert => ({
    source: must(parseAlertSource('bridge')), pane: paneId(pane), label: must(parseText(label)), at: instant(at), details: details.map((detail) => must(parseText(detail))),
});

function stored(known: Record<string, WorktreeStatus>, tokens: Record<string, { label: string; value: string }[]>, mode: { gitNote: WorktreeSwitch }, alerts: Record<string, PaneAlert[]> = {}): ReturnType<typeof storedNotes> {
    const statuses: WorktreeStatusReader = { statusOf: (pane: PaneId): WorktreeStatus | null => known[pane] ?? null };
    const notes: PaneNoteReader = { notesOf: (pane: PaneId) => tokens[pane] ?? [] };
    const raised: PaneAlertReader = { alertsOf: (pane: PaneId): readonly PaneAlert[] => alerts[pane] ?? [] };
    return storedNotes({ statuses, notes, alerts: raised, gitNote: (): WorktreeSwitch => mode.gitNote });
}

test('an alert a source raised is drawn first, with its own time and details, then the git note and the pane\'s notes', () => {
    const mode = { gitNote: 'on' as WorktreeSwitch };
    const extension = stored({ 'w1:p1': status(0, 0, 0) }, { 'w1:p1': [{ label: 'note', value: 'hold' }] }, mode, { 'w1:p1': [alertAt('w1:p1', 'unmerged', 5, ['feat/x', '3 unmerged'])] });
    const result = extension.notes?.([lane('w1:p1')]) ?? { kind: 'notes', byPane: new Map() };
    assert.deepEqual(labels(result), [['w1:p1', '⚑ unmerged feat/x|3 unmerged ; ⎇ main  ; ⚑ note hold']]);
    assert.equal(result.kind === 'notes' && result.byPane.get('w1:p1')?.[0]?.at, 5);
});

test('the git note and the pane\'s note tokens are drawn under their lane, git first; nothing for a lane with neither', () => {
    const mode = { gitNote: 'on' as WorktreeSwitch };
    const extension = stored({ 'w1:p1': status(1, 2, 0) }, { 'w1:p1': [{ label: 'note', value: 'hold' }], 'w1:p3': [{ label: 'review', value: 'waiting' }] }, mode);
    const result = extension.notes?.([lane('w1:p1'), lane('w1:p2'), lane('w1:p3')], 'en') ?? { kind: 'notes', byPane: new Map() };
    assert.deepEqual(labels(result), [['w1:p1', '⎇ main 1 unpushed|2 changed ; ⚑ note hold'], ['w1:p3', '⚑ review waiting']]);
});

test('TAB_RECAP_GIT_NOTE=off hides the git note at call time and keeps the pane\'s notes', () => {
    const mode = { gitNote: 'off' as WorktreeSwitch };
    const extension = stored({ 'w1:p1': status(1, 2, 0) }, { 'w1:p1': [{ label: 'note', value: 'hold' }] }, mode);
    assert.deepEqual(labels(extension.notes?.([lane('w1:p1')]) ?? { kind: 'notes', byPane: new Map() }), [['w1:p1', '⚑ note hold']]);
    mode.gitNote = 'on';
    assert.match(labels(extension.notes?.([lane('w1:p1')]) ?? { kind: 'notes', byPane: new Map() })[0]?.[1] ?? '', /^⎇ main/);
});

test('the extension has a name, and the registry no longer carries a column-side git or token extension', () => {
    assert.equal(storedNotes({ statuses: { statusOf: () => null }, notes: { notesOf: () => [] }, alerts: { alertsOf: () => [] }, gitNote: (): WorktreeSwitch => 'on' }).id, STORED_NOTES_ID);
    assert.deepEqual(FACTORIES, []);
});

test('a factory receives the store the loader was given, and none when the loader has none', () => {
    const seen: (ExtensionStore | undefined)[] = [];
    const factory: ExtensionFactory = (_get, store) => { seen.push(store); return null; };
    const store: ExtensionStore = { alerts: { put: (): void => undefined, clear: (): void => undefined, forgetPane: (): void => undefined } };
    loadExtensions(() => undefined, [factory], store);
    loadExtensions(() => undefined, [factory]);
    assert.deepEqual(seen, [store, undefined]);
});
