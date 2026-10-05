import type { Unknown } from './unknowable.ts';

/** What a lane's working directory is, as far as git is concerned. */
export type RepoResult =
    /** `branch` is null on a detached HEAD */
    | { readonly kind: 'repo'; readonly root: string; readonly branch: string | null }
    | { readonly kind: 'no-repo' }
    | Unknown;

export interface LaneRepo {
    /** The repository (top-level directory and current branch) a lane's cwd belongs to. Never throws, never blocks the caller's loop. */
    repoOf(cwd: string): Promise<RepoResult>;
}
