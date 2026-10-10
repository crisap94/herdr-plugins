import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { backUp, backupsOf } from './backup.ts';
import { connect, connectReadOnly, MEMORY } from './connection.ts';
import { latestVersion, migrate, versionOf } from './migrate.ts';
import { MIGRATIONS } from './schema/index.ts';
import type { Migration } from './schema/migration.ts';

export interface NewerDatabase {
    readonly kind: 'newer-db';
    readonly db: DatabaseSync;
    readonly found: number;
    readonly known: number;
    readonly backup: string | null;
}

export type Opened = { readonly kind: 'ready'; readonly db: DatabaseSync } | NewerDatabase;

function createFresh(db: DatabaseSync, path: string): void {
    db.exec('PRAGMA auto_vacuum = INCREMENTAL');
    if (path !== MEMORY) {
        db.exec('PRAGMA journal_mode = WAL');
    }
}

function newerThan(path: string, known: number): NewerDatabase | null {
    const db = connectReadOnly(path);
    const found = versionOf(db);
    if (found <= known) {
        db.close();
        return null;
    }
    return { kind: 'newer-db', db, found, known, backup: backupsOf(path)[0] ?? null };
}

export function openDatabase(path: string, migrations: readonly Migration[] = MIGRATIONS): Opened {
    const known = latestVersion(migrations);
    if (path !== MEMORY) {
        mkdirSync(dirname(path), { recursive: true });
    }
    const db = connect(path);
    const current = versionOf(db);
    if (current > known) {
        db.close();
        return newerThan(path, known) ?? { kind: 'ready', db: connect(path) };
    }
    if (current === 0) {
        createFresh(db, path);
    } else if (current < known && path !== MEMORY) {
        backUp(db, path, current);
    }
    migrate(db, migrations);
    return { kind: 'ready', db };
}
