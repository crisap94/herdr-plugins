import * as sqlite from 'bun:sqlite';

export function open(path: string): sqlite.Database {
    return new sqlite.Database(path, { create: true });
}
