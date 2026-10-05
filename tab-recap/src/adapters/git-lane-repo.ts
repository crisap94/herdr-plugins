// Asks git which repository and branch a lane's directory belongs to. Read-only: no optional locks
// (so a status check never creates index.lock under the operator's own git) and no fsmonitor daemon.
import { duration } from '#src/recap/domain/time.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { LaneRepo, RepoResult } from '#src/ports/lane-repo.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { run, scrubbedEnv } from './run.ts';
import type { Runner, RunResult } from './run.ts';

export const REPO_TTL_MS = 10_000;
const TIMEOUT_MS = 1500;
const NOT_A_REPOSITORY = 128;
const ENOENT = 127;

const GIT = ['-c', 'core.fsmonitor=false'];
export const ROOT_ARGS: readonly string[] = [...GIT, 'rev-parse', '--show-toplevel'];
/** exits 1 on a detached HEAD, and still works in a repository with no commit yet */
export const BRANCH_ARGS: readonly string[] = [...GIT, 'symbolic-ref', '--short', '-q', 'HEAD'];

export function gitEnv(): NodeJS.ProcessEnv {
    return { ...scrubbedEnv(), GIT_OPTIONAL_LOCKS: '0' };
}

function failure(result: RunResult): RepoResult {
    if (result.timedOut) {
        return unknown({ why: 'timeout', after: duration(TIMEOUT_MS) });
    }
    if (result.code === ENOENT) {
        return unknown({ why: 'unreachable', detail: 'git is not installed' });
    }
    return unknown({ why: 'failed', code: result.code, detail: result.stderr.trim().slice(0, 200) });
}

export class GitLaneRepo implements LaneRepo {
    private readonly cache = new Map<string, { readonly result: RepoResult; readonly at: number }>();
    private readonly inflight = new Map<string, Promise<RepoResult>>();
    private readonly runner: Runner;
    private readonly clock: Clock;
    private readonly ttlMs: number;

    constructor(clock: Clock, runner: Runner = run, ttlMs: number = REPO_TTL_MS) {
        this.clock = clock;
        this.runner = runner;
        this.ttlMs = ttlMs;
    }

    repoOf(cwd: string): Promise<RepoResult> {
        const cached = this.cache.get(cwd);
        if (cached !== undefined && this.clock.now() - cached.at < this.ttlMs) {
            return Promise.resolve(cached.result);
        }
        const pending = this.inflight.get(cwd) ?? this.ask(cwd);
        this.inflight.set(cwd, pending);
        return pending;
    }

    private async ask(cwd: string): Promise<RepoResult> {
        const result = await this.look(cwd);
        this.inflight.delete(cwd);
        if (result.kind !== 'unknown') {
            this.cache.set(cwd, { result, at: this.clock.now() });
        }
        return result;
    }

    private async look(cwd: string): Promise<RepoResult> {
        const options = { input: '', timeoutMs: TIMEOUT_MS, cwd, env: gitEnv() };
        const [root, branch] = await Promise.all([this.runner('git', ROOT_ARGS, options), this.runner('git', BRANCH_ARGS, options)]);
        if (root.code === NOT_A_REPOSITORY) {
            return { kind: 'no-repo' };
        }
        if (root.code !== 0 || root.timedOut) {
            return failure(root);
        }
        const name = branch.code === 0 ? branch.stdout.trim() : '';
        return { kind: 'repo', root: root.stdout.trim(), branch: name === '' ? null : name };
    }
}
