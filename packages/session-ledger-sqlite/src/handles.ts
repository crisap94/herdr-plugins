import type { Database } from 'bun:sqlite';
import type { ReadOnlyStore, Store } from './store.ts';

const handles = new WeakMap<Store | ReadOnlyStore, Database>();

export function remember<Held extends Store | ReadOnlyStore>(held: Held, handle: Database): Held {
    handles.set(held, handle);
    return held;
}

export function handleBehind(held: Store | ReadOnlyStore): Database {
    const handle = handles.get(held);
    if (handle === undefined) {
        throw new Error('this store carries no database handle');
    }
    return handle;
}
