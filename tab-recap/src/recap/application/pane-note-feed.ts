import type { PaneNoteWriter } from '#src/ports/worktree-status.ts';
import type { NoteToken } from '#src/recap/domain/coordination.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { notesKey } from '#src/recap/domain/pane-notes.ts';
import type { Text } from '#src/recap/domain/text.ts';

export class PaneNoteFeed {
    private readonly store: PaneNoteWriter;
    private readonly written = new Map<PaneId, Text>();

    constructor(store: PaneNoteWriter) {
        this.store = store;
        store.reset();
    }

    update(pane: PaneId, notes: readonly NoteToken[]): void {
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

    forget(pane: PaneId): void {
        if (this.written.delete(pane)) {
            this.store.forget(pane);
        }
    }
}
