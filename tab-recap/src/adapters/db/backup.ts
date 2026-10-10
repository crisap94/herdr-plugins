import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const KEEP = 3;
const PATTERN = /\.v(\d+)\.bak$/;

const versionOf = (name: string): number => Number(PATTERN.exec(name)?.[1] ?? 0);

export const backupPath = (path: string, version: number): string => `${path}.v${version}.bak`;

export function backupsOf(path: string): readonly string[] {
    const found = readdirSync(dirname(path)).filter((name) => name.startsWith(`${basename(path)}.v`) && PATTERN.test(name));
    return found.toSorted((a, b) => versionOf(b) - versionOf(a)).map((name) => join(dirname(path), name));
}

export function backUp(db: DatabaseSync, path: string, version: number): string {
    const target = backupPath(path, version);
    if (!existsSync(target)) {
        const aside = `${target}.${process.pid}.tmp`;
        rmSync(aside, { force: true });
        db.prepare('VACUUM INTO ?').run(aside);
        renameSync(aside, target);
    }
    for (const old of backupsOf(path).slice(KEEP)) {
        rmSync(old, { force: true });
    }
    return target;
}
