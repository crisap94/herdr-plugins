import { stat } from 'node:fs/promises';
import { failure, GIT, TIMEOUT_MS, gitEnv } from './git-lane-repo.ts';
import { parseLastCommit, parsePorcelainV2 } from './git-porcelain.ts';
import { run } from './process.ts';
import type { Runner } from './process.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import type { LastCommitResult, UncommittedResult, WorksiteReader } from '#src/ports/worksite-reader.ts';

export const LAST_COMMIT_ARGS: readonly string[] = [...GIT, 'log', '-1', '--format=%h%x00%s'];
export const PORCELAIN_ARGS: readonly string[] = [...GIT, 'status', '--porcelain=v2', '-z'];

async function isDirectory(directory: string): Promise<boolean> {
    return stat(directory).then((found) => found.isDirectory(), () => false);
}

export class GitWorksiteReader implements WorksiteReader {
    private readonly runner: Runner;

    constructor(runner: Runner = run) {
        this.runner = runner;
    }

    lastCommit(directory: string): Promise<LastCommitResult> {
        return this.read(directory, LAST_COMMIT_ARGS, (stdout) => {
            const commit = parseLastCommit(stdout);
            return commit === null ? null : { kind: 'commit', ...commit };
        });
    }

    uncommitted(directory: string): Promise<UncommittedResult> {
        return this.read(directory, PORCELAIN_ARGS, (stdout) => {
            const paths = parsePorcelainV2(stdout);
            return paths === null ? null : { kind: 'paths', count: paths.length, paths };
        });
    }

    private async read<T extends { readonly kind: string }>(directory: string, args: readonly string[], parse: (stdout: string) => T | null): Promise<T | Unknown> {
        if (!(await isDirectory(directory))) {
            return unknown({ why: 'not-found', what: 'directory' });
        }
        const result = await this.runner('git', args, { input: '', timeoutMs: TIMEOUT_MS, cwd: directory, env: gitEnv() });
        if (result.timedOut || result.code !== 0) {
            return failure(result);
        }
        return parse(result.stdout) ?? unknown({ why: 'unreadable', detail: 'git output did not parse' });
    }
}
