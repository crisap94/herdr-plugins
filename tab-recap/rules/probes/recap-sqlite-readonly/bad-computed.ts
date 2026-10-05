import { DatabaseSync } from 'node:sqlite';

export function open(path: string, options: { readOnly: boolean }): DatabaseSync {
    return new DatabaseSync(path, options);
}
