// A copy of the database before an upgrade, so a bad migration (or a rollback to an older release) has somewhere to go back to.
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const KEEP = 3;
const PATTERN = /\.v(\d+)\.bak$/;

const versionOf = (name: string): number => Number(PATTERN.exec(name)?.[1] ?? 0);

export const backupPath = (path: string, version: number): string => `${path}.v${version}.bak`;

/** The backups next to `path`, newest schema version first. */
export function backupsOf(path: string): readonly string[] {
    const found = readdirSync(dirname(path)).filter((name) => name.startsWith(`${basename(path)}.v`) && PATTERN.test(name));
    return found.toSorted((a, b) => versionOf(b) - versionOf(a)).map((name) => join(dirname(path), name));
}

/**
 * Copy the database as it is at `version`, unless that copy exists already (another process made it). `VACUUM INTO`
 * is synchronous and takes a consistent snapshot of a WAL database; it is written aside and renamed, so a half copy never has the name.
 */
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
