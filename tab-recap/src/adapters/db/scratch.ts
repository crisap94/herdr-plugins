import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from './database.ts';
import type { Store } from './database.ts';

export interface Scratch {
    readonly store: Store;
    readonly dir: string;
    dispose(): void;
}

export function scratchStore(): Scratch {
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-replay-'));
    const opened = openStore(join(dir, 'replay.db'));
    if (opened.kind !== 'ready') {
        rmSync(dir, { recursive: true, force: true });
        throw new Error('a fresh database is never newer');
    }
    return { store: opened, dir, dispose: (): void => { opened.close(); rmSync(dir, { recursive: true, force: true }); } };
}
