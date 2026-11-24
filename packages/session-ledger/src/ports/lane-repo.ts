import type { Directory } from '#src/recap/domain/directory.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from './unknowable.ts';

export type Forge = 'gitlab' | 'github';

export interface WebBase { readonly base: Text; readonly forge: Forge; }

export type RepoResult =
    | { readonly kind: 'repo'; readonly root: Directory; readonly branch: Text | null; readonly web: WebBase | null }
    | { readonly kind: 'no-repo' }
    | Unknown;

export interface Workplaces {
    repoOf(cwd: Directory): Promise<RepoResult>;
}
