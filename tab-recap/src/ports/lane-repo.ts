import type { Unknown } from './unknowable.ts';

export type Forge = 'gitlab' | 'github';

export interface WebBase {
    readonly base: string;
    readonly forge: Forge;
}

export type RepoResult =
    | { readonly kind: 'repo'; readonly root: string; readonly branch: string | null; readonly web: WebBase | null }
    | { readonly kind: 'no-repo' }
    | Unknown;

export interface LaneRepo {
    repoOf(cwd: string): Promise<RepoResult>;
}
