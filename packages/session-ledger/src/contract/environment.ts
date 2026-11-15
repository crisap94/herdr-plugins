import type { Instant } from './kernel.ts';

export interface RepoResult { readonly pendingStep: 'FND-2c' }

export interface Clock { now(): Instant }
export interface Ids { next(): string }
export interface Workplaces { repoOf(cwd: string): Promise<RepoResult> }
