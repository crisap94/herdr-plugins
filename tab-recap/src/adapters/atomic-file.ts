import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Temp file + rename, so a reader never sees half a file. */
export function writeAtomically(path: string, body: string): void {
    mkdirSync(join(path, '..'), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, body);
    renameSync(temporary, path);
}
