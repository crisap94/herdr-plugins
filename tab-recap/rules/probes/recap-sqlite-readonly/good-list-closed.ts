import { DatabaseSync } from 'node:sqlite';

export function openForListClosed(path: string): DatabaseSync {
    return new DatabaseSync(path, { readOnly: true, timeout: 500 });
}
