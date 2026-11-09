import { findRoot, Errors } from 'isomorphic-git';
import type { FsClient } from 'isomorphic-git';
import { resolve } from 'node:path';
import { err, ok, type Result } from '#src/protocol/result.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { WorktreeLookup } from '#src/ports/worktree-status.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';
import type { WorktreeWatch } from '#src/recap/domain/worktree.ts';
import { COMMONDIR_FILE, DETAIL_MAX, GIT_DIR_NAME, GITDIR_PREFIX, NOT_A_REPOSITORY, NOT_A_REPOSITORY_DETAIL, NO_DETAIL } from './git-constants.ts';
import { GitDeadline, layeredFs } from './git-layered-fs.ts';
import type { Disk } from './git-layered-fs.ts';

export interface Handle {
    readonly fs: FsClient;
    readonly dir: Directory;
    readonly gitdir: Directory;
}

export function unreadable(failure: ParseFailure): Unknown {
    return unknown({ why: 'unreadable', detail: failure.kind });
}

export function notARepository(): Unknown {
    return unknown({ why: 'failed', code: NOT_A_REPOSITORY, detail: NOT_A_REPOSITORY_DETAIL });
}

export async function withinBudget<T>(budget: Duration, work: (deadline: Instant) => Promise<T>): Promise<T | Unknown> {
    const timedOut = unknown({ why: 'timeout', after: budget });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const backstop = new Promise<Unknown>((settle) => {
        timer = setTimeout(() => { settle(timedOut); }, budget);
    });
    try {
        return await Promise.race([work(instant(Date.now() + budget)), backstop]);
    } catch (error) {
        if (error instanceof GitDeadline) {
            return timedOut;
        }
        const detail = error instanceof Error ? error.message : NO_DETAIL;
        return unknown({ why: 'unreadable', detail: detail.slice(0, DETAIL_MAX) });
    } finally {
        clearTimeout(timer);
    }
}

export function handleOf(layout: WorktreeWatch, deadline: Instant, disk: Disk): Handle {
    return { fs: layeredFs(disk, layout, deadline), dir: layout.root, gitdir: layout.gitDir };
}

async function rootOf(cwd: Directory, disk: Disk): Promise<Directory | null> {
    try {
        const found = await findRoot({ fs: { promises: disk }, filepath: cwd });
        const real = parseDirectory(await disk.realpath(found));
        return real.kind === 'ok' ? real.value : null;
    } catch (error) {
        if (error instanceof Errors.NotFoundError) {
            return null;
        }
        throw error;
    }
}

async function gitDirOf(root: Directory, disk: Disk): Promise<Result<Directory, ParseFailure>> {
    const dotGit = `${root}/${GIT_DIR_NAME}`;
    if ((await disk.stat(dotGit)).isDirectory()) {
        return parseDirectory(await disk.realpath(dotGit));
    }
    const line = (await disk.readFile(dotGit, 'utf8')).trim();
    if (!line.startsWith(GITDIR_PREFIX)) {
        return err({ kind: 'not-a-row' });
    }
    const pointed = line.slice(GITDIR_PREFIX.length).trim();
    return parseDirectory(await disk.realpath(resolve(root, pointed)));
}

async function commonDirOf(gitDir: Directory, disk: Disk): Promise<Result<Directory, ParseFailure>> {
    const pointer = await disk.readFile(`${gitDir}/${COMMONDIR_FILE}`, 'utf8').catch(() => null);
    if (pointer === null) {
        return ok(gitDir);
    }
    return parseDirectory(await disk.realpath(resolve(gitDir, pointer.trim())));
}

export async function openRepo(cwd: Directory, disk: Disk): Promise<WorktreeLookup> {
    const isDirectory = (await disk.stat(cwd).catch(() => null))?.isDirectory() === true;
    if (!isDirectory) {
        return { kind: 'no-repo' };
    }
    const root = await rootOf(cwd, disk);
    if (root === null) {
        return { kind: 'no-repo' };
    }
    const gitDir = await gitDirOf(root, disk);
    if (gitDir.kind === 'err') {
        return unreadable(gitDir.error);
    }
    const commonDir = await commonDirOf(gitDir.value, disk);
    if (commonDir.kind === 'err') {
        return unreadable(commonDir.error);
    }
    return { kind: 'worktree', worktree: { root, gitDir: gitDir.value, commonDir: commonDir.value } };
}
