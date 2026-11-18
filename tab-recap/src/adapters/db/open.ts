import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Database } from 'bun:sqlite';
import { backUp, backupsOf } from './backup.ts';
import { closeDatabase, connect, connectReadOnly, MEMORY } from './connection.ts';
import { latestVersion, migrate, versionOf } from './migrate.ts';
import { MIGRATIONS } from './schema/index.ts';
import type { Migration } from './schema/migration.ts';

export type Role = 'owner' | 'reader';

export interface NewerDatabase {
    readonly kind: 'newer-db';
    readonly db: Database;
    readonly found: number;
    readonly known: number;
    readonly backup: string | null;
}

export interface StaleDatabase {
    readonly kind: 'stale-store';
    readonly found: number;
    readonly known: number;
    readonly close: () => void;
}

export interface ReadyDatabase {
    readonly kind: 'ready';
    readonly db: Database;
}

export type Opened = ReadyDatabase | NewerDatabase;

function createFresh(db: Database, path: string): void {
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

function openReader(path: string, migrations: readonly Migration[]): Opened | StaleDatabase {
    const known = latestVersion(migrations);
    if (!existsSync(path)) {
        return { kind: 'stale-store', found: 0, known, close: () => undefined };
    }
    const probe = connectReadOnly(path);
    const found = versionOf(probe);
    if (found > known) {
        return { kind: 'newer-db', db: probe, found, known, backup: backupsOf(path)[0] ?? null };
    }
    if (found < known) {
        return { kind: 'stale-store', found, known, close: () => { probe.close(); } };
    }
    probe.close();
    return { kind: 'ready', db: connect(path) };
}

export function openDatabase(path: string, migrations?: readonly Migration[], role?: 'owner'): Opened;
export function openDatabase(path: string, migrations: readonly Migration[], role: Role): Opened | StaleDatabase;
export function openDatabase(path: string, migrations: readonly Migration[] = MIGRATIONS, role: Role = 'owner'): Opened | StaleDatabase {
    if (role === 'reader') {
        return openReader(path, migrations);
    }
    const known = latestVersion(migrations);
    if (path !== MEMORY) {
        mkdirSync(dirname(path), { recursive: true });
    }
    const db = connect(path);
    const current = versionOf(db);
    if (current > known) {
        closeDatabase(db);
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
