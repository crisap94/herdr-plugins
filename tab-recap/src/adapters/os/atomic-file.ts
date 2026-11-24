import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { Text } from '@stateforge-labs/session-ledger';

export type FileMode = 0o600 | 0o640 | 0o644 | 0o700 | 0o755;

export function writeAtomically(path: FsPath, body: Text, mode?: FileMode): void {
    mkdirSync(join(path, '..'), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    if (mode === undefined) {
        writeFileSync(temporary, body);
    } else {
        rmSync(temporary, { force: true });
        writeFileSync(temporary, body, { mode });
        chmodSync(temporary, mode);
    }
    renameSync(temporary, path);
}
