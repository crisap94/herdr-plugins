import { promises as fsp } from 'node:fs';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { LaneRepo, RepoResult } from '#src/ports/lane-repo.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { REPO_TTL_MS, TIMEOUT_MS } from './constants.ts';
import { handleOf, openRepo, unreadable, withinBudget } from './reach.ts';
import { branchOf, originWebOf } from './reach-history.ts';

export async function repoAt(directory: Directory): Promise<RepoResult> {
    return withinBudget(TIMEOUT_MS, async (deadline): Promise<RepoResult> => {
        const lookup = await openRepo(directory, fsp);
        if (lookup.kind !== 'worktree') {
            return lookup;
        }
        const handle = handleOf(lookup.worktree, deadline, fsp);
        const branch = await branchOf(handle);
        if (branch.kind === 'err') {
            return unreadable(branch.error);
        }
        const web = await originWebOf(handle);
        return { kind: 'repo', root: lookup.worktree.root, branch: branch.value, web };
    });
}

export class GitLaneRepo implements LaneRepo {
    private readonly cache = new Map<string, { readonly result: RepoResult; readonly at: number }>();
    private readonly inflight = new Map<string, Promise<RepoResult>>();
    private readonly clock: Clock;
    private readonly ttlMs: number;

    constructor(clock: Clock, ttlMs: number = REPO_TTL_MS) {
        this.clock = clock;
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
        const directory = parseDirectory(cwd);
        return directory.kind === 'ok' ? repoAt(directory.value) : unknown({ why: 'unreadable', detail: directory.error.kind });
    }
}
