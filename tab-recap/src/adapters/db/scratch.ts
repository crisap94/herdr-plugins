import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { must } from '@stateforge-labs/session-ledger';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { openStoreAt } from './database.ts';
import type { Store } from './database.ts';

export interface Scratch {
    readonly store: Store;
    readonly dir: FsPath;
    dispose(): void;
}

export function scratchStore(): Scratch {
    const dir = must(parseFsPath(mkdtempSync(join(tmpdir(), 'tab-recap-replay-'))));
    const opened = openStoreAt(must(parseFsPath(join(dir, 'replay.db'))));
    if (opened.kind !== 'ready') {
        rmSync(dir, { recursive: true, force: true });
        throw new Error('a fresh database is never newer');
    }
    return { store: opened, dir, dispose: (): void => { opened.close(); rmSync(dir, { recursive: true, force: true }); } };
}
