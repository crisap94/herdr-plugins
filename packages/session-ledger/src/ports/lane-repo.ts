import type { Directory } from '#src/recap/domain/directory.ts';
import type { RepoResult } from './legacy.ts';

export type { Forge, RepoResult, WebBase } from './legacy.ts';

export interface LaneRepo {
    repoOf(cwd: Directory): Promise<RepoResult>;
}
