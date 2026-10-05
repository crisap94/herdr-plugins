import { DatabaseSync } from 'node:sqlite';

export function open(path: string): DatabaseSync {
    return new DatabaseSync(path, { readOnly: true, timeout: 500 });
}
