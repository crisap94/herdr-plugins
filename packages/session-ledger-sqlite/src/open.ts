import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Database } from 'bun:sqlite';
import { backUp, backupPath, backupsOf } from './backup.ts';
import { closeDatabase, connect, connectReadOnly, IN_MEMORY } from './connection.ts';
import { latestVersion, migrate, versionOf } from './migrate.ts';
import type { Migration } from './migration.ts';

export type Role = 'owner' | 'reader';

export type StoreEvent =
    | { readonly kind: 'store-created' }
    | { readonly kind: 'backup-taken'; readonly path: string; readonly version: number }
    | { readonly kind: 'store-upgraded'; readonly from: number; readonly to: number };

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
    readonly events: readonly StoreEvent[];
}

export type Opened = ReadyDatabase | NewerDatabase;

function createFresh(db: Database, path: string): void {
    db.exec('PRAGMA auto_vacuum = INCREMENTAL');
    if (path !== IN_MEMORY) {
        db.exec('PRAGMA journal_mode = WAL');
    }
}

function newestBackupOf(path: string): string | null {
    return backupsOf(path)[0] ?? null;
}

function newerThan(path: string, known: number): NewerDatabase | null {
    const db = connectReadOnly(path);
    const found = versionOf(db);
    if (found <= known) {
        db.close();
        return null;
    }
    return { kind: 'newer-db', db, found, known, backup: newestBackupOf(path) };
}

function openReader(path: string, migrations: readonly Migration[]): Opened | StaleDatabase {
    const known = latestVersion(migrations);
    if (!existsSync(path)) {
        return { kind: 'stale-store', found: 0, known, close: () => undefined };
    }
    const probe = connectReadOnly(path);
    const found = versionOf(probe);
    if (found > known) {
        return { kind: 'newer-db', db: probe, found, known, backup: newestBackupOf(path) };
    }
    if (found < known) {
        return { kind: 'stale-store', found, known, close: () => { probe.close(); } };
    }
    probe.close();
    return { kind: 'ready', db: connect(path), events: [] };
}

export function openForRole(path: string, migrations: readonly Migration[], role: Role): Opened | StaleDatabase {
    return role === 'reader' ? openReader(path, migrations) : openDatabase(path, migrations);
}

export function openDatabase(path: string, migrations: readonly Migration[]): Opened {
    const known = latestVersion(migrations);
    if (path !== IN_MEMORY) {
        mkdirSync(dirname(path), { recursive: true });
    }
    const db = connect(path);
    const current = versionOf(db);
    if (current > known) {
        closeDatabase(db);
        return newerThan(path, known) ?? { kind: 'ready', db: connect(path), events: [] };
    }
    const events: StoreEvent[] = [];
    if (current === 0) {
        createFresh(db, path);
        events.push({ kind: 'store-created' });
    } else if (current < known && path !== IN_MEMORY) {
        const taken = !existsSync(backupPath(path, current));
        const target = backUp(db, path, current);
        if (taken) {
            events.push({ kind: 'backup-taken', path: target, version: current });
        }
    }
    migrate(db, migrations);
    if (current > 0 && current < known) {
        events.push({ kind: 'store-upgraded', from: current, to: known });
    }
    return { kind: 'ready', db, events };
}
