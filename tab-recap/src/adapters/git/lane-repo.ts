import { promises as fsp } from 'node:fs';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { Workplaces, RepoResult } from '#src/ports/lane-repo.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Duration } from '#src/recap/domain/time.ts';
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

export class GitLaneRepo implements Workplaces {
    private readonly cache = new Map<Directory, { readonly result: RepoResult; readonly at: number }>();
    private readonly inflight = new Map<Directory, Promise<RepoResult>>();
    private readonly clock: Clock;
    private readonly ttlMs: Duration;

    constructor(clock: Clock, ttlMs: Duration = REPO_TTL_MS) {
        this.clock = clock;
        this.ttlMs = ttlMs;
    }

    repoOf(cwd: string): Promise<RepoResult> {
        const directory = parseDirectory(cwd);
        return directory.kind === 'ok' ? this.repoIn(directory.value) : Promise.resolve(unknown({ why: 'unreadable', detail: causeOf(must(parseText(directory.error.kind))) }));
    }

    private repoIn(directory: Directory): Promise<RepoResult> {
        const cached = this.cache.get(directory);
        if (cached !== undefined && this.clock.now() - cached.at < this.ttlMs) {
            return Promise.resolve(cached.result);
        }
        const pending = this.inflight.get(directory) ?? this.ask(directory);
        this.inflight.set(directory, pending);
        return pending;
    }

    private async ask(directory: Directory): Promise<RepoResult> {
        const result = await repoAt(directory);
        this.inflight.delete(directory);
        if (result.kind !== 'unknown') {
            this.cache.set(directory, { result, at: this.clock.now() });
        }
        return result;
    }
}
