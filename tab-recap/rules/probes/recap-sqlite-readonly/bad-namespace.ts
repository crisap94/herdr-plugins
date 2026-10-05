import * as sqlite from 'node:sqlite';

export function open(path: string): sqlite.DatabaseSync {
    return new sqlite.DatabaseSync(path, { open: true });
}
