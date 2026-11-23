import type { Migration } from './migration.ts';
import type { StoreEvent } from './open.ts';

export type MigrationHistory = readonly Migration[];

export interface Store {
    readonly kind: 'ready';
    readonly events: readonly StoreEvent[];
    writeTransaction<T>(work: () => T): T;
    checkpoint(): void;
    close(): void;
}

export interface NewerStore {
    readonly kind: 'newer-store';
    readonly found: number;
    readonly known: number;
    readonly backup: string | null;
    close(): void;
}

export interface StaleStore {
    readonly kind: 'stale-store';
    readonly found: number;
    readonly known: number;
    close(): void;
}

export type Opened = Store | NewerStore | StaleStore;

export interface ReadOnlyStore {
    readonly version: number;
    close(): void;
}
