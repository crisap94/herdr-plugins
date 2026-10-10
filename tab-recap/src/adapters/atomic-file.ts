import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeAtomically(path: string, body: string): void {
    mkdirSync(join(path, '..'), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, body);
    renameSync(temporary, path);
}
