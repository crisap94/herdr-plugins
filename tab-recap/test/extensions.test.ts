import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notesByPaneOf, warningTextsOf } from '#src/extensions/load.ts';
import type { ExtensionPort, PaneNote, PaneNotesResult } from '#src/ports/extension.ts';
import { unknown } from '@stateforge-labs/session-ledger';
import { paneId } from '#test/support/ids.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

const note = (label: string): PaneNote => ({ label: textOf(label), at: null, details: [] });

test('notes merge per pane in order; an unknown reading and a silent extension add none', () => {
    const extensions: ExtensionPort[] = [
        { id: textOf('a'), notes: (): PaneNotesResult => ({ kind: 'notes', byPane: new Map([[paneId('p1'), [note('one')]]]) }) },
        { id: textOf('b'), notes: (): PaneNotesResult => unknown({ why: 'not-found', what: textOf('b') }) },
        { id: textOf('c') },
        { id: textOf('d'), notes: (): PaneNotesResult => ({ kind: 'notes', byPane: new Map([[paneId('p1'), [note('two')]], [paneId('p2'), [note('three')]]]) }) },
    ];
    const merged = notesByPaneOf(extensions);
    assert.deepEqual(merged.get(paneId('p1'))?.map((n) => n.label), ['one', 'two']);
    assert.deepEqual(merged.get(paneId('p2'))?.map((n) => n.label), ['three']);
});

test('warnings: only the non-null ones', () => {
    assert.deepEqual(warningTextsOf([{ id: textOf('a'), warning: (): Text => textOf('w') }, { id: textOf('b'), warning: (): null => null }, { id: textOf('c') }], 'en'), ['w']);
});
