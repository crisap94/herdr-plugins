import { messagesFor } from '#src/i18n/index.ts';
import type { Locale } from '#src/i18n/messages.ts';
import type { ExtensionPort, PaneNote, PaneNotesResult } from '#src/ports/extension.ts';
import type { TabLaneRecord } from '#src/ports/tab-views.ts';
import type { PaneAlertReader } from '#src/ports/pane-alerts.ts';
import type { PaneNoteReader, WorktreeStatusReader } from '#src/ports/worktree-status.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { changedOf } from '#src/recap/domain/worktree.ts';
import type { WorktreeStatus, WorktreeSwitch } from '#src/recap/domain/worktree.ts';

export const STORED_NOTES_ID = 'stored-notes';
export const GIT_NOTE_MARK = '⎇';

export interface StoredNotesDeps {
    readonly statuses: WorktreeStatusReader;
    readonly notes: PaneNoteReader;
    readonly alerts: PaneAlertReader;
    readonly gitNote: () => WorktreeSwitch;
}

export function gitNoteOf(status: WorktreeStatus, locale: Locale): PaneNote {
    const m = messagesFor(locale);
    const ahead = status.ahead ?? 0;
    const changed = changedOf(status);
    const details = [...(ahead === 0 ? [] : [textOf(m.git.unpushed(ahead))]), ...(changed === 0 ? [] : [textOf(m.git.changed(changed))])];
    return { label: status.branch, at: null, details, mark: textOf(GIT_NOTE_MARK) };
}

class StoredNotes implements ExtensionPort {
    readonly id = textOf(STORED_NOTES_ID);
    private readonly deps: StoredNotesDeps;

    constructor(deps: StoredNotesDeps) {
        this.deps = deps;
    }

    notes(lanes: readonly TabLaneRecord[] = [], locale: Locale = 'en'): PaneNotesResult {
        const byPane = new Map<PaneId, readonly PaneNote[]>();
        const showGit = this.deps.gitNote() === 'on';
        for (const lane of lanes) {
            const found = [...this.alertNotes(lane.pane), ...(showGit ? this.gitNotes(lane.pane, locale) : []), ...this.tokenNotes(lane.pane)];
            if (found.length > 0) {
                byPane.set(lane.pane, found);
            }
        }
        return { kind: 'notes', byPane };
    }

    private alertNotes(pane: PaneId): readonly PaneNote[] {
        return this.deps.alerts.alertsOf(pane).map((alert): PaneNote => ({ label: alert.label, at: alert.at, details: alert.details }));
    }

    private gitNotes(pane: PaneId, locale: Locale): readonly PaneNote[] {
        const status = this.deps.statuses.statusOf(pane);
        return status === null ? [] : [gitNoteOf(status, locale)];
    }

    private tokenNotes(pane: PaneId): readonly PaneNote[] {
        return this.deps.notes.notesOf(pane).map((note): PaneNote => ({ label: note.label, at: null, details: [note.value] }));
    }
}

export function storedNotes(deps: StoredNotesDeps): ExtensionPort {
    return new StoredNotes(deps);
}
