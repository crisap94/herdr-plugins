import type { DatabaseSync } from 'node:sqlite';

export interface Rebuild {
    readonly table: string;
    readonly create: string;
    readonly copy: string;
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
