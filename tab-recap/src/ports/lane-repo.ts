import type { Unknown } from './unknowable.ts';

export type Forge = 'gitlab' | 'github';

/** Where a repository lives on the web: `https://host/group/repo`, no credentials, no `.git`. */
export interface WebBase {
    readonly base: string;
    readonly forge: Forge;
}

/** What a lane's working directory is, as far as git is concerned. */
export type RepoResult =
    /** `branch` is null on a detached HEAD; `web` is null without an `origin` remote git can turn into a web address */
    | { readonly kind: 'repo'; readonly root: string; readonly branch: string | null; readonly web: WebBase | null }
    | { readonly kind: 'no-repo' }
    | Unknown;

export interface LaneRepo {
    /** The repository (top-level directory and current branch) a lane's cwd belongs to. Never throws, never blocks the caller's loop. */
    repoOf(cwd: string): Promise<RepoResult>;
}
