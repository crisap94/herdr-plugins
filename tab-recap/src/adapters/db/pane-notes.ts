import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { err, ok, type Result } from '#src/protocol/result.ts';
import type { PaneNoteReader, PaneNoteWriter } from '#src/ports/worktree-status.ts';
import type { NoteToken } from '#src/recap/domain/coordination.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseNonEmptyText, parseText } from '#src/recap/domain/text.ts';
import { writeTx } from './connection.ts';
import { all, guarded, isRow } from './rows.ts';

type PaneNoteRow = NoteToken;

export function parsePaneNoteRow(input: unknown): Result<PaneNoteRow, ParseFailure> {
    if (!isRow(input)) {
        return err({ kind: 'not-a-row' });
    }
    const label = parseText(input.label);
    if (label.kind === 'err') {
        return label;
    }
    const value = parseNonEmptyText(input.value);
    if (value.kind === 'err') {
        return value;
    }
    return ok({ label: label.value, value: value.value });
}

export class PaneNotesRepository implements PaneNoteWriter, PaneNoteReader {
    private readonly db: DatabaseSync;
    private readonly read: StatementSync;
    private readonly insert: StatementSync;
    private readonly clear: StatementSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.read = db.prepare('SELECT label, value FROM pane_note WHERE pane = ? ORDER BY label');
        this.insert = db.prepare('INSERT OR REPLACE INTO pane_note (pane, label, value) VALUES (?, ?, ?)');
        this.clear = db.prepare('DELETE FROM pane_note WHERE pane = ?');
    }

    replace(pane: PaneId, notes: readonly NoteToken[]): void {
        writeTx(this.db, () => {
            this.clear.run(pane);
            notes.forEach((note) => { this.insert.run(pane, note.label, note.value); });
        });
    }

    forget(pane: PaneId): void {
        this.clear.run(pane);
    }

    reset(): void {
        this.db.exec('DELETE FROM pane_note');
    }

    notesOf(pane: PaneId): readonly NoteToken[] {
        return guarded(() => all(this.read, pane).flatMap((row) => {
            const parsed = parsePaneNoteRow(row);
            return parsed.kind === 'ok' ? [parsed.value] : [];
        }), []);
    }
}
