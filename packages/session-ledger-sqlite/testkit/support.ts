import { join } from 'node:path';
import type { MigrationHistory, OpenResult, NewerResult, Queryable, ReadyResult, StaleResult, StoreSubject, StoreWorld } from './contract.ts';

export const BUSY_MS = 2000;
export const INCREMENTAL = 2;
export const FULL_SYNC = 2;

export const storePath = (world: StoreWorld): string => join(world.folder, 'store.db');

export const backupNameOf = (path: string, version: number): string => `${path}.v${version}.bak`;

export function ensure(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

export function same(actual: unknown, expected: unknown, message: string): void {
    if (!Object.is(actual, expected)) {
        throw new Error(`${message}: got ${String(actual)}, expected ${String(expected)}`);
    }
}

export function sameShape(actual: unknown, expected: unknown, message: string): void {
    const got = JSON.stringify(actual);
    const want = JSON.stringify(expected);
    if (got !== want) {
        throw new Error(`${message}: got ${got}, expected ${want}`);
    }
}

export function rejects(run: () => unknown, message: string, accept: (error: unknown) => boolean = () => true): void {
    try {
        run();
    } catch (error) {
        ensure(accept(error), `${message}: the wrong error was thrown`);
        return;
    }
    throw new Error(`${message}: nothing was thrown`);
}

export function readyOf(result: OpenResult): ReadyResult {
    if (result.kind !== 'ready') {
        throw new Error(`expected a ready store, got ${result.kind}`);
    }
    return result;
}

export function newerOf(result: OpenResult): NewerResult {
    if (result.kind !== 'newer') {
        throw new Error(`expected a newer store, got ${result.kind}`);
    }
    return result;
}

export function staleOf(result: OpenResult): StaleResult {
    if (result.kind !== 'stale') {
        throw new Error(`expected a stale store, got ${result.kind}`);
    }
    return result;
}

export function firstOf(row: unknown): unknown {
    if (typeof row !== 'object' || row === null) {
        return undefined;
    }
    const values: readonly unknown[] = Object.values(row);
    return values[0];
}

export const pragmaOf = (store: Queryable, name: string): unknown => firstOf(store.one(`PRAGMA ${name}`));

export const countOf = (store: Queryable, table: string): number => Number(firstOf(store.one(`SELECT count(*) FROM ${table}`)));

export const tableExists = (store: Queryable, table: string): boolean =>
    Number(firstOf(store.one(`SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name = '${table}'`))) === 1;

export function isMigrationFailed(error: unknown): boolean {
    return error instanceof Error && error.constructor.name === 'MigrationFailed';
}

export function openOwner(subject: StoreSubject, path: string, history: MigrationHistory): ReadyResult {
    return readyOf(subject.open(path, history, 'owner'));
}

export function versionAt(subject: StoreSubject, path: string): number {
    const probe = subject.openReadOnly(path);
    try {
        return probe.version;
    } finally {
        probe.close();
    }
}
