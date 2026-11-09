import { Database } from 'bun:sqlite';

export function open(path: string): Database {
    return new Database(path, { readonly: false });
}
