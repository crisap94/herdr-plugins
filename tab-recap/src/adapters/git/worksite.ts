import { promises as fsp } from 'node:fs';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import type { LastCommitResult, UncommittedResult, WorksiteReader } from '#src/ports/worksite-reader.ts';
import { TIMEOUT_MS } from './constants.ts';
import { handleOf, notARepository, openRepo, unreadable, withinBudget } from './reach.ts';
import type { Handle } from './reach.ts';
import { lastCommitOf } from './reach-history.ts';
import { changesOf } from './reach-status.ts';

async function isDirectory(directory: string): Promise<boolean> {
    return fsp.stat(directory).then((found) => found.isDirectory(), () => false);
}

export class GitWorksiteReader implements WorksiteReader {
    lastCommit(directory: string): Promise<LastCommitResult> {
        return this.read(directory, async (handle: Handle): Promise<LastCommitResult> => {
            const commit = await lastCommitOf(handle);
            return commit === null ? unknown({ why: 'not-found', what: 'commit' }) : { kind: 'commit', ...commit };
        });
    }

    uncommitted(directory: string): Promise<UncommittedResult> {
        return this.read(directory, async (handle: Handle): Promise<UncommittedResult> => {
            const changes = await changesOf(handle);
            if (changes.kind === 'err') {
                return unreadable(changes.error);
            }
            const paths = [...changes.value.tracked, ...changes.value.untracked];
            return { kind: 'paths', count: paths.length, paths };
        });
    }

    private async read<T>(directory: string, work: (handle: Handle) => Promise<T | Unknown>): Promise<T | Unknown> {
        const checked = parseDirectory(directory);
        if (checked.kind === 'err' || !(await isDirectory(checked.value))) {
            return unknown({ why: 'not-found', what: 'directory' });
        }
        return withinBudget(TIMEOUT_MS, async (deadline) => {
            const lookup = await openRepo(checked.value, fsp);
            if (lookup.kind !== 'worktree') {
                return lookup.kind === 'no-repo' ? notARepository() : lookup;
            }
            return work(handleOf(lookup.worktree, deadline, fsp));
        });
    }
}
