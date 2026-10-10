import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { nodeHost } from '#src/host/node-host.mjs';
import type { Harnesses, HarnessesResult } from '#src/ports/harnesses.ts';

export function onPath(command: string, path: string): boolean {
    return path.split(delimiter).some((dir) => {
        try {
            accessSync(join(dir === '' ? '.' : dir, command), constants.X_OK);
            return true;
        } catch {
            return false;
        }
    });
}

export class PathHarnesses implements Harnesses {
    private readonly ids: readonly string[];

    constructor(ids: readonly string[]) {
        this.ids = ids;
    }

    available(): Promise<HarnessesResult> {
        const path = nodeHost().path;
        return Promise.resolve({ kind: 'available', ids: this.ids.filter((id) => onPath(id, path)) });
    }
}
