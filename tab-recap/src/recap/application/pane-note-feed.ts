import type { PaneNoteWriter } from '#src/ports/worktree-status.ts';
import type { NoteToken } from '#src/recap/domain/coordination.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import { notesKey } from '#src/recap/domain/pane-notes.ts';
import type { Text } from '@stateforge-labs/session-ledger';

export class PaneNoteFeed {
    private readonly store: PaneNoteWriter;
    private readonly written = new Map<SessionKey, Text>();

    constructor(store: PaneNoteWriter) {
        this.store = store;
        store.reset();
    }

    update(pane: SessionKey, notes: readonly NoteToken[]): void {
        const key = notesKey(notes);
        if (this.written.get(pane) === key) {
            return;
        }
        this.written.set(pane, key);
        if (notes.length === 0) {
            this.store.forget(pane);
        } else {
            this.store.replace(pane, notes);
        }
    }

    forget(pane: SessionKey): void {
        if (this.written.delete(pane)) {
            this.store.forget(pane);
        }
    }
}
