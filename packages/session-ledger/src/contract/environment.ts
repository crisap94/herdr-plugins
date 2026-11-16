import type { Instant, Unknown } from './kernel.ts';

export type Forge = 'gitlab' | 'github';

export interface WebBase {
    readonly base: string;
    readonly forge: Forge;
}

export type RepoResult =
    | { readonly kind: 'repo'; readonly root: string; readonly branch: string | null; readonly web: WebBase | null }
    | { readonly kind: 'no-repo' }
    | Unknown;

export interface Clock { now(): Instant }
export interface Ids { next(): string }
export interface Workplaces { repoOf(cwd: string): Promise<RepoResult> }
