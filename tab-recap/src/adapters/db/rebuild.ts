// SQLite's way to change a column: build the new table, copy, drop the old, rename. Used from a migration's `up(db)`
// (the runner has switched `foreign_keys` off and checks `foreign_key_check` before it commits; no pragma juggling here).
import type { DatabaseSync } from 'node:sqlite';

export interface Rebuild {
    readonly table: string;
    /** `CREATE TABLE <table>_new (…)` — the shape the table is to have */
    readonly create: string;
    /** `INSERT INTO <table>_new (…) SELECT … FROM <table>` */
    readonly copy: string;
    /** the table's indexes (and any view that read it), created again once the rename is done */
    readonly after?: readonly string[];
}

export function rebuildTable(db: DatabaseSync, step: Rebuild): void {
    db.exec(step.create);
    db.exec(step.copy);
    db.exec(`DROP TABLE ${step.table}`);
    db.exec(`ALTER TABLE ${step.table}_new RENAME TO ${step.table}`);
    for (const statement of step.after ?? []) {
        db.exec(statement);
    }
}
