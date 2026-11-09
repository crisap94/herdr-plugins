import { Database } from 'bun:sqlite';

export function openForListClosed(path: string): Database {
    return new Database(path, { readonly: true, strict: true });
}
