import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notesByPaneOf, warningTextsOf } from '#src/extensions/load.ts';
import type { Extension, Note, NotesResult } from '#src/ports/extension.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { paneId } from '#test/support/ids.ts';
import { textOf } from '#src/recap/domain/text.ts';

const note = (label: string): Note => ({ label, at: null, details: [] });

test('notes merge per pane in order; an unknown reading and a silent extension add none', () => {
    const extensions: Extension[] = [
        { id: 'a', notes: (): NotesResult => ({ kind: 'notes', byPane: new Map([['p1', [note('one')]]]) }) },
        { id: 'b', notes: (): NotesResult => unknown({ why: 'not-found', what: textOf('b') }) },
        { id: 'c' },
        { id: 'd', notes: (): NotesResult => ({ kind: 'notes', byPane: new Map([['p1', [note('two')]], ['p2', [note('three')]]]) }) },
    ];
    const merged = notesByPaneOf(extensions);
    assert.deepEqual(merged.get(paneId('p1'))?.map((n) => n.label), ['one', 'two']);
    assert.deepEqual(merged.get(paneId('p2'))?.map((n) => n.label), ['three']);
});

test('warnings: only the non-null ones', () => {
    assert.deepEqual(warningTextsOf([{ id: 'a', warning: (): string => 'w' }, { id: 'b', warning: (): null => null }, { id: 'c' }], 'en'), ['w']);
});
