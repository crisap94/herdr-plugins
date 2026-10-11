import { DatabaseSync } from 'node:sqlite';

export function openForPrintFromClosed(path: string): DatabaseSync {
    return new DatabaseSync(path, { timeout: 500 });
}
