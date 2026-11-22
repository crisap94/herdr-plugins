import type { Brand, Instant, Text, Unknown } from './kernel.ts';
import type { Directory } from './ids.ts';

export type Forge = 'gitlab' | 'github';

export interface WebBase {
    readonly base: Text;
    readonly forge: Forge;
}

export type RepoResult =
    | { readonly kind: 'repo'; readonly root: Directory; readonly branch: Text | null; readonly web: WebBase | null }
    | { readonly kind: 'no-repo' }
    | Unknown;

export interface Clock { now(): Instant }
export type MintedId = Brand<string, 'MintedId'>;

export interface Ids { next(): MintedId }
export interface Workplaces { repoOf(cwd: Directory): Promise<RepoResult> }
