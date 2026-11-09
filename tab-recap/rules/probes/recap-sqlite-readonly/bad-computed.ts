import { Database } from 'bun:sqlite';

export function open(path: string, options: { readonly: boolean }): Database {
    return new Database(path, options);
}
