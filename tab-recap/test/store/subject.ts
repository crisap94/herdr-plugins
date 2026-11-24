import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import type { Subject } from '@stateforge-labs/session-ledger/testkit';
import type { MigrationHistory, NewerResult, OpenResult, ReadOnlyResult, ReadyResult, Role, StoreSubject, StoreWorld } from '@stateforge-labs/session-ledger-sqlite/testkit';
import { backupsOf } from '#src/adapters/db/backup.ts';
import { closeDatabase, connectReadOnly, MEMORY, writeTx } from '#src/adapters/db/connection.ts';
import { openDatabase, openForRole, type Opened, type StaleDatabase } from '#src/adapters/db/open.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseFsPath, fsPathOf } from '#src/recap/domain/fs-path.ts';
import { versionOf } from '#src/adapters/db/migrate.ts';

const handles = new WeakMap<ReadyResult, Database>();

const readyOver = (db: Database): ReadyResult => {
    const result: ReadyResult = {
        kind: 'ready',
        events: null,
        exec: (sql: string) => {
            db.exec(sql);
        },
        one: (sql: string) => db.prepare(sql).get(),
        close: () => {
            closeDatabase(db);
        },
    };
    handles.set(result, db);
    return result;
};

const newerOver = (db: Database, found: number, known: number, backup: string | null): NewerResult => ({
    kind: 'newer',
    found,
    known,
    backup,
    close: () => {
        db.close();
    },
});

const openedOver = (opened: Opened | StaleDatabase): OpenResult => {
    if (opened.kind === 'ready') {
        return readyOver(opened.db);
    }
    if (opened.kind === 'newer-db') {
        return newerOver(opened.db, opened.found, opened.known, opened.backup);
    }
    return { kind: 'stale', found: opened.found, known: opened.known, close: opened.close };
};

const pluginStore: StoreSubject = {
    name: 'plugin store',
    memory: MEMORY,
    open: (path: string, history: MigrationHistory, role: Role): OpenResult => openedOver(role === 'owner' ? openDatabase(fsPathOf(path), history) : openForRole(must(parseFsPath(path)), history, role)),
    openReadOnly: (path: string): ReadOnlyResult => {
        const db = connectReadOnly(path);
        return {
            version: versionOf(db),
            exec: (sql: string) => {
                db.exec(sql);
            },
            one: (sql: string) => db.prepare(sql).get(),
            close: () => {
                db.close();
            },
        };
    },
    transaction: <T>(result: OpenResult, work: () => T): T => {
        const db = result.kind === 'ready' ? handles.get(result) : undefined;
        if (db === undefined) {
            throw new Error('transaction needs a ready store');
        }
        return writeTx(db, work);
    },
    backupsOf: (path: string) => backupsOf(path),
};

export const pluginStoreSubject: Subject<StoreWorld, StoreSubject> = {
    name: 'plugin store mechanism',
    level: 'full',
    world: (): StoreWorld => ({ folder: mkdtempSync(join(tmpdir(), 'tab-recap-store-')) }),
    create: () => pluginStore,
};

const idsOf = (group: string, parsed: unknown): readonly string[] => {
    if (!Array.isArray(parsed)) {
        throw new Error(`pending-${group}.json is not an array`);
    }
    return parsed.map((id: unknown) => {
        if (typeof id !== 'string') {
            throw new Error(`pending-${group}.json holds an id that is not a string`);
        }
        return id;
    });
};

export const STORE_MECHANISM_GROUPS: readonly string[] = ['ROL', 'EVS'];

export const pendingOf = (groups: readonly string[]): readonly string[] =>
    groups.flatMap((group) => idsOf(group, JSON.parse(readFileSync(new URL(`./pending-${group}.json`, import.meta.url), 'utf8'))));
