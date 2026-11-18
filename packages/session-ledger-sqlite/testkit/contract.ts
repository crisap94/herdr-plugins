export type Role = 'owner' | 'reader';

export type StoreEvent =
    | { readonly kind: 'store-created' }
    | { readonly kind: 'backup-taken'; readonly path: string; readonly version: number }
    | { readonly kind: 'store-upgraded'; readonly from: number; readonly to: number };

export interface SqlHandle {
    exec(sql: string): void;
}

export interface Queryable {
    one(sql: string): unknown;
}

export interface Migration {
    readonly version: number;
    readonly name: string;
    readonly up: string | readonly string[] | ((handle: SqlHandle) => void);
}

export type MigrationHistory = readonly Migration[];

export interface ReadyResult extends Queryable {
    readonly kind: 'ready';
    readonly events: readonly StoreEvent[] | null;
    exec(sql: string): void;
    close(): void;
}

export interface NewerResult {
    readonly kind: 'newer';
    readonly found: number;
    readonly known: number;
    readonly backup: string | null;
    close(): void;
}

export interface StaleResult {
    readonly kind: 'stale';
    readonly found: number;
    readonly known: number;
    close(): void;
}

export type OpenResult = ReadyResult | NewerResult | StaleResult;

export interface ReadOnlyResult extends Queryable {
    readonly version: number;
    exec(sql: string): void;
    close(): void;
}

export interface StoreSubject {
    readonly name: string;
    readonly memory: string;
    open(path: string, history: MigrationHistory, role: Role): OpenResult;
    openReadOnly(path: string): ReadOnlyResult;
    transaction<T>(result: OpenResult, work: () => T): T;
    backupsOf(path: string): readonly string[];
}

export interface StoreWorld {
    readonly folder: string;
}
