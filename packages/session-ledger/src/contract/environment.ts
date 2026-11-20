import type { Brand, Instant, Unknown } from './kernel.ts';
import type { Directory } from './ids.ts';

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
export type MintedId = Brand<string, 'MintedId'>;

export interface Ids { next(): MintedId }
export interface Workplaces { repoOf(cwd: Directory): Promise<RepoResult> }
