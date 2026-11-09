import type { Database } from 'bun:sqlite';
import { eq, sql } from 'drizzle-orm';
import { err, ok, type Result } from '#src/protocol/result.ts';
import type { PaneNoteReader, PaneNoteWriter } from '#src/ports/worktree-status.ts';
import type { NoteToken } from '#src/recap/domain/coordination.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseNonEmptyText, parseText } from '#src/recap/domain/text.ts';
import { writeTx } from './connection.ts';
import { paneNote } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded, isRow } from './rows.ts';

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
    private readonly db: Database;
    private readonly orm: Orm;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
    }

    replace(pane: PaneId, notes: readonly NoteToken[]): void {
        writeTx(this.db, () => {
            this.clear(pane);
            notes.forEach((note) => {
                this.orm.insert(paneNote).values({ pane, label: note.label, value: note.value })
                    .onConflictDoUpdate({ target: [paneNote.pane, paneNote.label], set: { value: sql`excluded.value` } })
                    .run();
            });
        });
    }

    forget(pane: PaneId): void {
        this.clear(pane);
    }

    reset(): void {
        this.orm.delete(paneNote).run();
    }

    notesOf(pane: PaneId): readonly NoteToken[] {
        return guarded(() => this.orm.select({ label: paneNote.label, value: paneNote.value }).from(paneNote).where(eq(paneNote.pane, pane)).orderBy(paneNote.label).all().flatMap((row) => {
            const parsed = parsePaneNoteRow(row);
            return parsed.kind === 'ok' ? [parsed.value] : [];
        }), []);
    }

    private clear(pane: PaneId): void {
        this.orm.delete(paneNote).where(eq(paneNote.pane, pane)).run();
    }
}
