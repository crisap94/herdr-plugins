import type { Database } from 'bun:sqlite';
import {
    openDatabase as openRawDatabase,
    openForRole as openRawForRole,
    type NewerDatabase as RawNewerDatabase,
    type Opened as RawOpened,
    type StaleDatabase as RawStaleDatabase,
} from '@stateforge-labs/session-ledger-sqlite/unstable/open.ts';
import { MIGRATIONS } from './schema/index.ts';
import type { Migration } from './schema/migration.ts';
import { must } from '@stateforge-labs/session-ledger';
import { countOf, parseCount, type Count } from '@stateforge-labs/session-ledger';
import { fsPathOf, type FsPath } from '#src/recap/domain/fs-path.ts';

export type Role = 'owner' | 'reader';

export interface NewerDatabase {
    readonly kind: 'newer-db';
    readonly db: Database;
    readonly found: Count;
    readonly known: Count;
    readonly backup: FsPath | null;
}

export interface StaleDatabase {
    readonly kind: 'stale-store';
    readonly found: Count;
    readonly known: Count;
    readonly close: () => void;
}

export interface ReadyDatabase {
    readonly kind: 'ready';
    readonly db: Database;
}

export type Opened = ReadyDatabase | NewerDatabase;

function newerOf(newer: RawNewerDatabase): NewerDatabase {
    return {
        kind: 'newer-db',
        db: newer.db,
        found: countOf(newer.found),
        known: countOf(newer.known),
        backup: newer.backup === null ? null : fsPathOf(newer.backup),
    };
}

function openedOf(raw: RawOpened): Opened {
    return raw.kind === 'ready' ? { kind: 'ready', db: raw.db } : newerOf(raw);
}

function staleOf(stale: RawStaleDatabase): StaleDatabase {
    return { kind: 'stale-store', found: must(parseCount(stale.found)), known: must(parseCount(stale.known)), close: stale.close };
}

export function openForRole(path: FsPath, migrations: readonly Migration[], role: Role): Opened | StaleDatabase {
    const raw = openRawForRole(path, migrations, role);
    return raw.kind === 'stale-store' ? staleOf(raw) : openedOf(raw);
}

export function openDatabase(path: FsPath, migrations: readonly Migration[] = MIGRATIONS): Opened {
    return openedOf(openRawDatabase(path, migrations));
}
