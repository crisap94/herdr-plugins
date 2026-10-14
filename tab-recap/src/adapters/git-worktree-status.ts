import { parsePorcelainReading } from '#src/recap/domain/porcelain.ts';
import { parseWorktreeWatch } from '#src/recap/domain/worktree.ts';
import type { StatusTier } from '#src/recap/domain/worktree.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { duration } from '#src/recap/domain/time.ts';
import type { StatusRead, WorktreeLocator, WorktreeLookup, WorktreeProbe } from '#src/ports/worktree-status.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { failure, GIT, gitEnv, TIMEOUT_MS } from './git-lane-repo.ts';
import { run } from './process.ts';
import type { Runner } from './process.ts';

export const LOCATE_ARGS: readonly string[] = [...GIT, 'rev-parse', '--show-toplevel', '--absolute-git-dir', '--path-format=absolute', '--git-common-dir'];
export const TRACKED_ARGS: readonly string[] = [...GIT, 'status', '--porcelain=v2', '--branch', '--untracked-files=no'];
export const FULL_ARGS: readonly string[] = [...GIT, 'status', '--porcelain=v2', '--branch', '--untracked-files=normal'];

export const TRACKED_TIMEOUT_MS = duration(3000);
export const FULL_TIMEOUT_MS = duration(8000);

const NOT_A_REPOSITORY = 128;

export class GitWorktreeLocator implements WorktreeLocator {
    private readonly runner: Runner;

    constructor(runner: Runner = run) {
        this.runner = runner;
    }

    async locate(cwd: Directory): Promise<WorktreeLookup> {
        const result = await this.runner('git', LOCATE_ARGS, { input: '', timeoutMs: TIMEOUT_MS, cwd, env: gitEnv() });
        if (result.code === NOT_A_REPOSITORY) {
            return { kind: 'no-repo' };
        }
        if (result.code !== 0 || result.timedOut) {
            return failure(result);
        }
        const parsed = parseWorktreeWatch(result.stdout);
        return parsed.kind === 'ok' ? { kind: 'worktree', worktree: parsed.value } : unknown({ why: 'unreadable', detail: 'rev-parse printed an unexpected answer' });
    }
}

export class GitWorktreeProbe implements WorktreeProbe {
    private readonly runner: Runner;

    constructor(runner: Runner = run) {
        this.runner = runner;
    }

    async read(root: Directory, tier: StatusTier): Promise<StatusRead> {
        const full = tier === 'full';
        const after = full ? FULL_TIMEOUT_MS : TRACKED_TIMEOUT_MS;
        const result = await this.runner('git', full ? FULL_ARGS : TRACKED_ARGS, { input: '', timeoutMs: after, cwd: root, env: gitEnv() });
        if (result.timedOut) {
            return unknown({ why: 'timeout', after });
        }
        if (result.code !== 0) {
            return failure(result);
        }
        const parsed = parsePorcelainReading(result.stdout);
        return parsed.kind === 'ok' ? { kind: 'read', reading: parsed.value } : unknown({ why: 'unreadable', detail: 'status printed an unexpected answer' });
    }
}
