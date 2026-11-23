import type { Database } from 'bun:sqlite';
import { handleBehind } from './handles.ts';
import type { ReadOnlyStore, Store } from './store.ts';

export type Handle = Database;

export function handleOf(store: Store | ReadOnlyStore): Handle {
    return handleBehind(store);
}

export { writeTransaction } from './connection.ts';
export { rebuildTable, type Rebuild } from './rebuild.ts';
