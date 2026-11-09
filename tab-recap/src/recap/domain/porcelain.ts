import type { Count } from './count.ts';
import type { Text } from './text.ts';

export type BranchName = Text;
export type AheadCount = Count | null;
export type TrackedCount = Count;
export type UntrackedCount = Count;

export interface PorcelainReading {
    readonly branch: BranchName;
    readonly ahead: AheadCount;
    readonly tracked: TrackedCount;
    readonly untracked: UntrackedCount;
}
