import { Database } from 'bun:sqlite';

export function openForPrintFromClosed(path: string): Database {
    return new Database(path, { strict: true });
}
