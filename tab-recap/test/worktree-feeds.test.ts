import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PaneNoteWriter } from '#src/ports/worktree-status.ts';
import { PaneNoteFeed } from '#src/recap/application/pane-note-feed.ts';
import type { NoteToken } from '#src/recap/domain/coordination.ts';
import { paneId } from '#test/support/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';

function store(): { readonly writer: PaneNoteWriter; readonly calls: string[] } {
    const calls: string[] = [];
    const writer: PaneNoteWriter = {
        replace: (pane, notes: readonly NoteToken[]): void => { calls.push(`replace ${pane} ${notes.map((note) => `${note.label}=${note.value}`).join(',')}`); },
        forget: (pane): void => { calls.push(`forget ${pane}`); },
        reset: (): void => { calls.push('reset'); },
    };
    return { writer, calls };
}

test('the feed starts from nothing, writes a pane\'s notes when they change and only then, and forgets a pane once', () => {
    const { writer, calls } = store();
    const feed = new PaneNoteFeed(writer);
    const pane = paneId('w1:p1');
    feed.update(pane, []);
    feed.update(pane, []);
    feed.update(pane, [{ label: textOf('note'), value: textOf('hold') }]);
    feed.update(pane, [{ label: textOf('note'), value: textOf('hold') }]);
    feed.update(pane, [{ label: textOf('note'), value: textOf('go') }]);
    feed.update(pane, []);
    feed.forget(pane);
    feed.forget(pane);
    assert.deepEqual(calls, ['reset', 'forget w1:p1', 'replace w1:p1 note=hold', 'replace w1:p1 note=go', 'forget w1:p1', 'forget w1:p1']);
});
