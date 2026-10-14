import { messagesFor } from '#src/i18n/index.ts';
import type { Locale } from '#src/i18n/messages.ts';
import type { Extension, Note, NotesResult } from '#src/ports/extension.ts';
import type { TabLane } from '#src/ports/tab-views.ts';
import type { PaneNoteReader, WorktreeStatusReader } from '#src/ports/worktree-status.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { parsePaneId } from '#src/recap/domain/ids.ts';
import { changedOf } from '#src/recap/domain/worktree.ts';
import type { WorktreeStatus, WorktreeSwitch } from '#src/recap/domain/worktree.ts';

export const STORED_NOTES_ID = 'stored-notes';
export const GIT_NOTE_MARK = '⎇';

export interface StoredNotesDeps {
    readonly statuses: WorktreeStatusReader;
    readonly notes: PaneNoteReader;
    readonly gitNote: () => WorktreeSwitch;
}

export function gitNoteOf(status: WorktreeStatus, locale: Locale): Note {
    const m = messagesFor(locale);
    const ahead = status.ahead ?? 0;
    const changed = changedOf(status);
    const details = [...(ahead === 0 ? [] : [m.git.unpushed(ahead)]), ...(changed === 0 ? [] : [m.git.changed(changed)])];
    return { label: status.branch, at: null, details, mark: GIT_NOTE_MARK };
}

class StoredNotes implements Extension {
    readonly id = STORED_NOTES_ID;
    private readonly deps: StoredNotesDeps;

    constructor(deps: StoredNotesDeps) {
        this.deps = deps;
    }

    notes(lanes: readonly TabLane[] = [], locale: Locale = 'en'): NotesResult {
        const byPane = new Map<string, readonly Note[]>();
        const showGit = this.deps.gitNote() === 'on';
        for (const lane of lanes) {
            const pane = parsePaneId(lane.pane);
            const found = pane.kind === 'ok' ? [...(showGit ? this.gitNotes(pane.value, locale) : []), ...this.tokenNotes(pane.value)] : [];
            if (found.length > 0) {
                byPane.set(lane.pane, found);
            }
        }
        return { kind: 'notes', byPane };
    }

    private gitNotes(pane: PaneId, locale: Locale): readonly Note[] {
        const status = this.deps.statuses.statusOf(pane);
        return status === null ? [] : [gitNoteOf(status, locale)];
    }

    private tokenNotes(pane: PaneId): readonly Note[] {
        return this.deps.notes.notesOf(pane).map((note): Note => ({ label: note.label, at: null, details: [note.value] }));
    }
}

export function storedNotes(deps: StoredNotesDeps): Extension {
    return new StoredNotes(deps);
}
